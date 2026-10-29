"""SkillSpector as a small HTTP service, for Ronne's scanner container (feature 156).

Ronne sends a submission's files through the proxy; this writes them to a folder of its own,
runs `skillspector scan` on it and answers with the report. It does for a request what Ronne's
command scanner (`command-scanner.ts`) does for a command: the same short environment, the same
timeout and its kill, the same cap on the output, the same path rules, and the folder removed
whatever happens. One scan at a time. Nothing from a request is logged.

  GET  /health  -> 200 {"scanner": "skillspector", "version": "2.13.2"}
  POST /scan    {"files": [{"path", "content" (base64), "executable"}], "semantic": bool,
                 "timeoutSeconds": int, "provider": {NAME: value}}  (provider: semantic only)
             -> 200 {"exit": int, "report": str}
             -> 400 bad request or bad file path · 408 request timeout · 411 · 413 too large
                · 500 write failed, not found, not runnable, internal · 502 output too large,
                signal · 503 busy · 504 timeout

Python's standard library only: the image gains no packages.
"""

import base64
import json
import os
import select
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unicodedata
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Ronne's own limits (`command-scanner.ts`, `@ronneai/core`), plus room for base64 and JSON.
OUTPUT_LIMIT = 4 * 1024 * 1024
# Ronne sends at most 20 MiB of files (`@ronneai/core`'s limits): about 28 MB in base64.
BODY_LIMIT = 32 * 1024 * 1024
MAX_FILES = 1000
PATH_MAX_LENGTH = 255
MAX_NAME_BYTES = 255
# The most `[` and `{` a real request can hold: one object per file, the brackets a path may
# contain, and the request's own. Counted before parsing, so a body of nested lists can't make
# the parser build millions of objects (about 50 bytes of memory for each byte of it).
MAX_BRACKETS = MAX_FILES * (PATH_MAX_LENGTH + 2) + 64
DEFAULT_TIMEOUT = 300
# As `command-scanner.ts`: SIGTERM, then SIGKILL after the grace; once the scanner has gone, the
# pipe gets this long to close (a process that escaped its group may hold it open).
KILL_GRACE = 5
SETTLE = 2
# A client must send its whole request within this, or the connection is dropped: no client can
# hold a scan's place by sending slowly. The body is read before the scan lock is taken.
READ_TIMEOUT = 60
# At most this many connections at once, each holding at most BODY_LIMIT: a memory bound, and
# threads and process slots left for the scanner. More are refused at once.
MAX_CONNECTIONS = 4
# A folder left behind (a process that escaped its group can keep files open in it) is removed
# once it's older than the longest scan could take, as `command-scanner.ts`'s sweep does.
STALE_FOLDER_SECONDS = 2 * (3600 + KILL_GRACE)
# The variables a provider may set: what SkillSpector reads for each provider Ronne offers.
PROVIDER_VARIABLES = frozenset(
    {
        "SKILLSPECTOR_PROVIDER",
        "SKILLSPECTOR_MODEL",
        "SKILLSPECTOR_REASONING_EFFORT",
        "OPENAI_API_KEY",
        "OPENAI_BASE_URL",
        "ANTHROPIC_API_KEY",
        "NVIDIA_INFERENCE_KEY",
        "AZURE_OPENAI_API_KEY",
        "AZURE_OPENAI_ENDPOINT",
        "AZURE_OPENAI_DEPLOYMENT",
        "AZURE_OPENAI_API_VERSION",
        "SKILLSPECTOR_COMPAT_API_KEY",
        "SKILLSPECTOR_COMPAT_BASE_URL",
        "OLLAMA_BASE_URL",
    }
)

SCANNER = os.environ.get("SKILLSPECTOR_BIN", "skillspector")
BUSY = threading.Lock()


class Refused(Exception):
    """A request the service won't run: its HTTP status and the error Ronne reads."""

    def __init__(self, status, error):
        super().__init__(error)
        self.status = status
        self.error = error


def scanner_version():
    try:
        from importlib.metadata import version

        return version("skillspector")
    except Exception:
        return None


def utf16_length(text):
    """JavaScript's `length`, which Ronne's limits count."""
    return len(text.encode("utf-16-le", "surrogatepass")) // 2


def path_problem(path):
    """Ronne's rules (`pathProblemOf`, `writeFiles`): relative, no `..`, no empty or `.` part, no
    control characters, at most 255 UTF-16 units, each name at most 255 bytes of UTF-8."""
    if not isinstance(path, str) or path == "" or utf16_length(path) > PATH_MAX_LENGTH:
        return True
    try:
        path.encode("utf-8")
    except UnicodeEncodeError:
        return True  # a lone surrogate: no file can have that name
    if any(ord(c) < 0x20 or ord(c) == 0x7F for c in path) or "\\" in path:
        return True
    if path.startswith("/"):
        return True
    parts = path.split("/")
    if ".." in parts or any(p in ("", ".") for p in parts):
        return True
    return any(len(p.encode("utf-8")) > MAX_NAME_BYTES for p in parts)


def fold(name):
    """Ronne's `caseClash` key: full case folding, as APFS does it (NFKC, lower, upper, lower)."""
    return unicodedata.normalize(
        "NFKC", unicodedata.normalize("NFKC", name).lower().upper().lower()
    )


def clashes(paths):
    """Two spellings of one name at any level (`caseClash`), or a path that is a file and a folder."""
    seen = {}
    for path in paths:
        parts = path.split("/")
        for i in range(1, len(parts) + 1):
            prefix = "/".join(parts[:i])
            key = fold(prefix)
            known = seen.get(key)
            if known is not None and known != prefix:
                return True
            seen[key] = prefix
    files = {fold(p) for p in paths}
    folders = {fold("/".join(p.split("/")[:i])) for p in paths for i in range(1, p.count("/") + 1)}
    return bool(files & folders)


def read_request(body):
    """The request's files, whether it's semantic, its timeout and its provider variables."""
    if body.count(b"[") + body.count(b"{") > MAX_BRACKETS:
        raise Refused(413, "too large")
    try:
        request = json.loads(body)
    except (ValueError, UnicodeDecodeError, RecursionError):
        raise Refused(400, "bad request")
    if not isinstance(request, dict) or not isinstance(request.get("files"), list):
        raise Refused(400, "bad request")
    files = request["files"]
    if len(files) > MAX_FILES:
        raise Refused(413, "too large")
    semantic = request.get("semantic") is True
    timeout = request.get("timeoutSeconds", DEFAULT_TIMEOUT)
    if not isinstance(timeout, int) or isinstance(timeout, bool) or not 30 <= timeout <= 3600:
        raise Refused(400, "bad request")
    provider = request.get("provider") or {}
    if not isinstance(provider, dict) or (provider and not semantic):
        raise Refused(400, "bad request")
    for name, value in provider.items():
        if name not in PROVIDER_VARIABLES or not isinstance(value, str) or "\0" in value:
            raise Refused(400, "bad request")
    decoded = []
    for entry in files:
        if not isinstance(entry, dict) or not isinstance(entry.get("content"), str):
            raise Refused(400, "bad request")
        path = entry.get("path")
        if path_problem(path):
            raise Refused(400, "bad file path")
        try:
            content = base64.b64decode(entry["content"], validate=True)
        except (ValueError, TypeError):
            raise Refused(400, "bad request")
        decoded.append((path, content, entry.get("executable") is True))
    if clashes([path for path, _, _ in decoded]):
        raise Refused(400, "bad file path")
    return decoded, semantic, timeout, provider


def write_files(root, files):
    for path, content, executable in files:
        target = os.path.join(root, *path.split("/"))
        os.makedirs(os.path.dirname(target), mode=0o700, exist_ok=True)
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
        fd = os.open(target, flags, 0o700 if executable else 0o600)
        with os.fdopen(fd, "wb") as out:
            out.write(content)


def remove_tree(path):
    """Removes the folder, first letting the owner back into every folder the scanner locked,
    top down, never through a symbolic link."""
    try:
        os.chmod(path, 0o700)
        for root, dirs, _files in os.walk(path):
            for name in dirs:
                folder = os.path.join(root, name)
                if not os.path.islink(folder):
                    os.chmod(folder, 0o700)
    except OSError:
        pass
    shutil.rmtree(path, ignore_errors=True)


def scanner_environment(home, timeout, provider):
    env = {
        "PATH": os.environ.get("PATH") or "/usr/local/bin:/usr/bin:/bin",
        "HOME": home,
        "TMPDIR": home,
        "LANG": "C.UTF-8",
        "SKILLSPECTOR_MAX_WORKFLOW_SECONDS": str(max(20, timeout - 10)),
        "SKILLSPECTOR_LOG_LEVEL": "ERROR",
        "LANGCHAIN_TRACING_V2": "false",
    }
    env.update(provider)
    return env


def signal_group(process, sig):
    try:
        os.killpg(process.pid, sig)
    except (ProcessLookupError, PermissionError):
        pass


def collect(process, timeout):
    """Reads the scanner's output until it's done, never trusting it to finish.

    On the timeout or the cap: SIGTERM to its group, SIGKILL after the grace. Once the scanner has
    exited, SIGKILL to anything left in its group, and the pipe gets SETTLE seconds to close
    before it's given up on. Returns the output and why it stopped early, if it did.
    """
    fd = process.stdout.fileno()
    chunks = []
    size = 0
    stopped = None
    deadline = time.monotonic() + timeout
    term_at = exited_at = None
    eof = False
    while True:
        now = time.monotonic()
        if exited_at is None and stopped is None and now >= deadline:
            stopped = "timeout"
        if stopped and term_at is None:
            signal_group(process, signal.SIGTERM)
            term_at = now
        if term_at is not None and now - term_at >= KILL_GRACE:
            signal_group(process, signal.SIGKILL)
        if exited_at is None and process.poll() is not None:
            exited_at = now
            signal_group(process, signal.SIGKILL)
        if exited_at is not None and (eof or now - exited_at >= SETTLE):
            break
        if eof:
            # The pipe is closed but the scanner still runs: wait for it, a little at a time.
            try:
                process.wait(0.2)
            except subprocess.TimeoutExpired:
                pass
            continue
        ready, _, _ = select.select([fd], [], [], 0.2)
        if not ready:
            continue
        chunk = os.read(fd, 65536)
        if not chunk:
            eof = True
            if exited_at is not None:
                break
            continue
        if stopped:
            continue
        size += len(chunk)
        if size > OUTPUT_LIMIT:
            stopped = "output too large"
            continue
        chunks.append(chunk)
    process.stdout.close()
    if process.poll() is None:
        signal_group(process, signal.SIGKILL)
        process.wait()
    return b"".join(chunks), stopped


def sweep_stale_folders():
    root = tempfile.gettempdir()
    try:
        names = os.listdir(root)
    except OSError:
        return
    for name in names:
        path = os.path.join(root, name)
        try:
            info = os.lstat(path)
        except OSError:
            continue
        if not name.startswith("ronne-scan-") or os.path.islink(path) or info.st_uid != os.getuid():
            continue
        if time.time() - info.st_mtime > STALE_FOLDER_SECONDS:
            remove_tree(path)


def run_scan(files, semantic, timeout, provider):
    sweep_stale_folders()
    folder = tempfile.mkdtemp(prefix="ronne-scan-")
    try:
        os.chmod(folder, 0o700)
        item = os.path.join(folder, "item")
        home = os.path.join(folder, "home")
        os.mkdir(item, 0o700)
        os.mkdir(home, 0o700)
        try:
            write_files(item, files)
        except (FileExistsError, NotADirectoryError, IsADirectoryError):
            raise Refused(400, "bad file path")
        except OSError:
            raise Refused(500, "write failed")
        args = [SCANNER, "scan", item] + ([] if semantic else ["--no-llm"]) + ["--format", "json"]
        try:
            process = subprocess.Popen(
                args,
                cwd=home,
                env=scanner_environment(home, timeout, provider if semantic else {}),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
        except FileNotFoundError:
            raise Refused(500, "not found")
        except PermissionError:
            raise Refused(500, "not runnable")
        report, stopped = collect(process, timeout)
        if stopped == "timeout":
            raise Refused(504, "timeout")
        if stopped == "output too large":
            raise Refused(502, "output too large")
        if process.returncode < 0:
            raise Refused(502, "signal")
        return {"exit": process.returncode, "report": report.decode("utf-8", "replace")}
    finally:
        remove_tree(folder)


class Handler(BaseHTTPRequestHandler):
    server_version = "ronne-scan"

    def version_string(self):
        return self.server_version
    timeout = READ_TIMEOUT

    def setup(self):
        super().setup()
        # The whole request, headers and body, within READ_TIMEOUT: the socket timeout alone is per
        # read, so a client sending a byte at a time would never hit it.
        self.reading = True
        self.watchdog = threading.Timer(READ_TIMEOUT, self.too_slow)
        self.watchdog.daemon = True
        self.watchdog.start()

    def too_slow(self):
        if self.reading:
            try:
                self.connection.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass

    def finish(self):
        self.watchdog.cancel()
        super().finish()

    def log_message(self, format, *args):
        # Which route, and nothing else from the request: a path could carry anything.
        command = getattr(self, "command", None)
        method = command if command in ("GET", "POST") else "other"
        path = (getattr(self, "path", None) or "").split("?", 1)[0]
        route = path if path in ("/scan", "/health") else "other"
        sys.stderr.write("%s %s\n" % (method, route))

    def log_error(self, format, *args):
        self.log_message(format, *args)

    def answer(self, status, body):
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_error(self, code, message=None, explain=None):
        # http.server's own errors (a bad request line, long headers), as JSON and without echoing
        # what the client sent.
        self.close_connection = True
        # A request line it couldn't read leaves HTTP/0.9, which has no status line.
        self.request_version = "HTTP/1.1"
        try:
            self.answer(code, {"error": "bad request"})
        except OSError:
            pass

    def do_GET(self):
        self.reading = False
        if self.path != "/health":
            return self.answer(404, {"error": "not found"})
        self.answer(200, {"scanner": "skillspector", "version": scanner_version()})

    def do_POST(self):
        if self.path != "/scan":
            return self.answer(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            return self.answer(411, {"error": "bad request"})
        if length < 0 or length > BODY_LIMIT:
            return self.answer(413, {"error": "too large"})
        # The whole body first, within READ_TIMEOUT, then the lock: a slow client holds no scan.
        try:
            body = self.rfile.read(length)
        except OSError:
            self.close_connection = True
            return
        self.reading = False
        if len(body) < length:
            return self.answer(400, {"error": "bad request"})
        if not BUSY.acquire(blocking=False):
            return self.answer(503, {"error": "busy"})
        # The lock is released before the answer goes out, so a client that sends its next
        # request as soon as it has one never finds it still held.
        try:
            files, semantic, timeout, provider = read_request(body)
            status, answer = 200, run_scan(files, semantic, timeout, provider)
        except Refused as refused:
            status, answer = refused.status, {"error": refused.error}
        except Exception as error:
            # Never a traceback, which could carry a path or a value from the request.
            sys.stderr.write("scan failed: %s\n" % type(error).__name__)
            status, answer = 500, {"error": "internal"}
        finally:
            BUSY.release()
        self.answer(status, answer)


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.slots = threading.BoundedSemaphore(MAX_CONNECTIONS)

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            try:
                request.sendall(BUSY_RESPONSE)
            except OSError:
                pass
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            # Its thread never started (out of processes, say), so it can't give the slot back.
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()

    def handle_error(self, request, client_address):
        # A client that left early, or anything else: its type only, never a traceback or address.
        sys.stderr.write("connection failed: %s\n" % sys.exc_info()[0].__name__)


BUSY_BODY = b'{"error": "busy"}'
BUSY_RESPONSE = (
    b"HTTP/1.1 503 Service Unavailable\r\nContent-Type: application/json\r\n"
    b"Content-Length: %d\r\nConnection: close\r\n\r\n" % len(BUSY_BODY)
) + BUSY_BODY


def main():
    port = int(os.environ.get("SCAN_PORT", "8080"))
    server = Server(("0.0.0.0", port), Handler)
    signal.signal(signal.SIGTERM, lambda *_: threading.Thread(target=server.shutdown).start())
    server.serve_forever()


if __name__ == "__main__":
    main()
