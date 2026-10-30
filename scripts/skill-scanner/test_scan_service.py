"""Tests for scan-service.py (feature 156), with a stand-in `skillspector`.

Run them anywhere Python 3.12+ is: `python3 -I -m unittest discover -s scripts/skill-scanner`. In
the scanner image, CI mounts this folder and gives the tests an executable /tmp (the service itself
runs with a noexec one; the tests write their stand-in scanner there):

  docker run --rm --read-only --tmpfs /tmp:exec --cap-drop ALL --security-opt no-new-privileges \\
    -v "$PWD/scripts/skill-scanner:/t:ro" --entrypoint /app/.venv/bin/python <image> \\
    -I -m unittest discover -s /t -p "test_*.py"
"""

import base64
import importlib.util
import json
import os
import socket
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))

# The stand-in reads what to do from the item's MODE file, and can report what it was given.
STAND_IN = r"""#!PYTHON
import json, os, signal, subprocess, sys, time
item = sys.argv[2]
path = os.path.join(item, "MODE")
mode = open(path).read().strip() if os.path.exists(path) else "ok"
if mode == "sleep":
    time.sleep(60)
if mode == "flood":
    sys.stdout.write("x" * (5 * 1024 * 1024)); sys.stdout.flush(); time.sleep(60)
if mode == "exit2":
    sys.exit(2)
if mode == "lock":
    os.chmod(item, 0o500)
if mode == "lock-deep":
    os.makedirs(os.path.join(item, "a", "b"))
    os.chmod(os.path.join(item, "a", "b"), 0o000)
    os.chmod(os.path.join(item, "a"), 0o000)
if mode == "trap-term":
    # Exits cleanly when told to stop: it's still a timeout, not a finished scan.
    signal.signal(signal.SIGTERM, lambda *_: (print("{}"), sys.exit(0)))
    time.sleep(60)
if mode.startswith("child-ignores-term"):
    # The scanner exits; a child in its group ignores SIGTERM, keeps the pipe open, and touches a
    # file (named after the colon) every tenth of a second while it lives.
    beat = mode.split(":", 1)[1] if ":" in mode else os.devnull
    subprocess.Popen([sys.executable, "-c",
        "import signal,sys,time\nsignal.signal(signal.SIGTERM, signal.SIG_IGN)\n"
        "while True:\n open(sys.argv[1], 'w').close(); time.sleep(0.1)", beat])
    # Not before the child has touched it once, so the test can tell it stopped.
    for _ in range(200):
        if os.path.exists(beat):
            break
        time.sleep(0.05)
    print("{}"); sys.exit(0)
if mode.startswith("link-out:"):
    # A link from inside the item to a folder outside it: removing the item must not touch it.
    os.symlink(mode.split(":", 1)[1], os.path.join(item, "out"))
if mode == "close-early":
    # Closes its output, then goes on and exits later with a code of its own.
    print("{}"); sys.stdout.flush(); os.close(1); time.sleep(1); sys.exit(3)
if mode == "child-escapes":
    # A child that leaves the group, so no kill reaches it, and keeps the pipe open.
    subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"], start_new_session=True)
    print("{}"); sys.exit(0)
report = {"args": sys.argv[1:], "env": dict(os.environ), "cwd": os.getcwd(),
          "files": sorted(os.path.relpath(os.path.join(d, f), item) for d, _, fs in os.walk(item) for f in fs)}
print(json.dumps(report))
sys.exit(1 if mode == "findings" else 0)
"""


def load_service(scanner):
    os.environ["SKILLSPECTOR_BIN"] = scanner
    spec = importlib.util.spec_from_file_location("scan_service", os.path.join(HERE, "scan-service.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def ronne_folders():
    root = tempfile.gettempdir()
    return {n for n in os.listdir(root) if n.startswith("ronne-scan-")}


class ScanServiceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.scanner = os.path.join(cls.tmp, "skillspector")
        with open(cls.scanner, "w") as out:
            out.write(STAND_IN.replace("PYTHON", sys.executable))
        os.chmod(cls.scanner, 0o755)
        cls.service = load_service(cls.scanner)
        cls.service.KILL_GRACE = 1
        cls.service.SETTLE = 1
        cls.service.Handler.timeout = 2
        cls.service.READ_TIMEOUT = 2
        cls.server = cls.service.Server(("127.0.0.1", 0), cls.service.Handler)
        cls.port = cls.server.server_address[1]
        cls.url = "http://127.0.0.1:%d" % cls.port
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def post(self, body, raw=None):
        data = raw if raw is not None else json.dumps(body).encode()
        request = urllib.request.Request(self.url + "/scan", data=data, method="POST")
        request.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            with error:
                return error.code, json.loads(error.read())

    def files(self, mode="ok"):
        return [
            {"path": "SKILL.md", "content": base64.b64encode(b"# hi\n").decode()},
            {"path": "MODE", "content": base64.b64encode(mode.encode()).decode()},
        ]

    def scan(self, mode="ok", **fields):
        body = {"files": self.files(mode), "timeoutSeconds": 30}
        body.update(fields)
        return self.post(body)

    def with_timeout(self, seconds, mode):
        """A scan whose timeout is `seconds`, below the 30 a request may ask for."""
        original = self.service.run_scan

        def short(files, semantic, timeout, provider):
            return original(files, semantic, seconds, provider)

        self.service.run_scan = short
        try:
            start = time.monotonic()
            result = self.scan(mode)
            return result, time.monotonic() - start
        finally:
            self.service.run_scan = original

    def test_health(self):
        with urllib.request.urlopen(self.url + "/health", timeout=5) as response:
            self.assertEqual(json.loads(response.read())["scanner"], "skillspector")

    def test_static_scan_gets_no_llm_and_a_short_environment(self):
        status, body = self.scan()
        self.assertEqual(status, 200)
        self.assertEqual(body["exit"], 0)
        report = json.loads(body["report"])
        self.assertEqual(report["args"][0], "scan")
        self.assertIn("--no-llm", report["args"])
        self.assertEqual(report["args"][-2:], ["--format", "json"])
        env = report["env"]
        self.assertEqual(env["SKILLSPECTOR_MAX_WORKFLOW_SECONDS"], "20")
        self.assertEqual(env["LANGCHAIN_TRACING_V2"], "false")
        self.assertNotIn("SKILLSPECTOR_BIN", env)
        self.assertEqual(sorted(report["files"]), ["MODE", "SKILL.md"])

    def test_findings_exit_one_is_a_report(self):
        self.assertEqual(self.scan("findings")[1]["exit"], 1)

    def test_other_exits_are_passed_on(self):
        status, body = self.scan("exit2")
        self.assertEqual((status, body["exit"]), (200, 2))

    def test_semantic_scan_gets_the_provider_and_no_no_llm(self):
        status, body = self.scan(
            semantic=True, provider={"SKILLSPECTOR_PROVIDER": "openai", "OPENAI_API_KEY": "sk-test"}
        )
        self.assertEqual(status, 200)
        report = json.loads(body["report"])
        self.assertNotIn("--no-llm", report["args"])
        self.assertEqual(report["env"]["OPENAI_API_KEY"], "sk-test")

    def test_provider_on_a_static_scan_or_an_unknown_variable_is_refused(self):
        self.assertEqual(self.scan(provider={"OPENAI_API_KEY": "x"})[0], 400)
        for name in ["LD_PRELOAD", "PATH", "PYTHONPATH"]:
            self.assertEqual(self.scan(semantic=True, provider={name: "/x"})[0], 400, name)

    def test_bad_paths_are_refused(self):
        emoji = "/".join(["\U0001f600" * 10] * 20)  # 219 code points, 419 UTF-16 units
        for path in ["/etc/passwd", "../x", "a/../b", "a//b", "./a", "a\\b", "a\nb", "", "x" * 256,
                     "é" * 200, emoji, "\ud800", "a\udc80"]:
            entry = {"path": path, "content": base64.b64encode(b"x").decode()}
            status, body = self.post({"files": [entry], "timeoutSeconds": 30})
            self.assertEqual((status, body["error"]), (400, "bad file path"), repr(path))

    def test_clashing_paths_are_refused(self):
        b = base64.b64encode(b"x").decode()
        for pair in (["A.md", "a.md"], ["a", "a/b"], ["café", "café"], ["A/x", "a/y"],
                     ["Ａ.md", "a.md"], ["straße", "strasse"], ["ﬁle", "file"]):
            files = [{"path": p, "content": b} for p in pair]
            self.assertEqual(self.post({"files": files, "timeoutSeconds": 30})[0], 400, pair)
        files = [{"path": p, "content": b} for p in ["a/x", "a/y"]]
        self.assertEqual(self.post({"files": files, "timeoutSeconds": 30})[0], 200)

    def test_bad_requests(self):
        self.assertEqual(self.post(None, raw=b"not json")[0], 400)
        self.assertEqual(self.post(None, raw=b"[" * 200000)[0], 400)
        self.assertEqual(self.post({"files": "x"})[0], 400)
        self.assertEqual(self.post({"files": [], "timeoutSeconds": 5})[0], 400)
        self.assertEqual(self.post({"files": [], "timeoutSeconds": True})[0], 400)
        self.assertEqual(self.post({"files": [{"path": "a", "content": "%%%"}]})[0], 400)

    def test_a_broken_request_line_gets_an_answer(self):
        for raw in [b"GARBAGE sk-echo\r\n\r\n", b"GET /x HTTP/9.9 sk-echo\r\n\r\n",
                    b"GET /health HTTP/1.1\r\nX: " + b"sk-echo" * 10000 + b"\r\n\r\n"]:
            with socket.create_connection(("127.0.0.1", self.port), timeout=5) as conn:
                conn.sendall(raw)
                answer = b""
                while True:
                    chunk = conn.recv(65536)
                    if not chunk:
                        break
                    answer += chunk
            self.assertRegex(answer, rb"^HTTP/1\.[01] 4\d\d ")
            self.assertIn(b"application/json", answer)
            self.assertNotIn(b"sk-echo", answer)

    def test_a_body_of_nested_lists_is_refused_before_it_is_parsed(self):
        # One entry, so only the bracket count can refuse it (not the file count).
        bomb = b'{"files": [' + b"[" * 300000 + b"]" * 300000 + b"]}"
        self.assertEqual(self.post(None, raw=bomb), (413, {"error": "too large"}))
        # Brackets in paths are fine, up to what a real request can hold.
        files = [{"path": "[x]{%d}.md" % i, "content": base64.b64encode(b"x").decode()} for i in range(50)]
        self.assertEqual(self.post({"files": files, "timeoutSeconds": 30})[0], 200)

    def test_too_large(self):
        original = self.service.BODY_LIMIT
        self.service.BODY_LIMIT = 100
        try:
            status, body = self.post({"files": self.files(), "pad": "x" * 200})
        finally:
            self.service.BODY_LIMIT = original
        self.assertEqual((status, body["error"]), (413, "too large"))

    def test_a_slow_client_holds_no_scan(self):
        with socket.create_connection(("127.0.0.1", self.port), timeout=10) as slow:
            slow.sendall(b"POST /scan HTTP/1.1\r\nContent-Length: 1000\r\n\r\n0123456789")
            time.sleep(0.3)
            self.assertEqual(self.scan()[0], 200)

    def test_timeout_kills_and_answers(self):
        (status, body), took = self.with_timeout(1, "sleep")
        self.assertEqual((status, body["error"]), (504, "timeout"))
        self.assertLess(took, 15)

    def test_a_scanner_that_exits_when_stopped_is_still_a_timeout(self):
        (status, body), _ = self.with_timeout(1, "trap-term")
        self.assertEqual((status, body["error"]), (504, "timeout"))

    def test_a_child_left_in_the_group_or_out_of_it_doesnt_hold_the_service(self):
        for mode in ["child-ignores-term", "child-escapes"]:
            start = time.monotonic()
            status, body = self.scan(mode)
            self.assertEqual((status, body["exit"]), (200, 0), mode)
            self.assertLess(time.monotonic() - start, 15, mode)
            self.assertEqual(self.scan()[0], 200, mode)

    def test_a_child_left_in_the_group_is_killed(self):
        beat = os.path.join(self.tmp, "beat")
        self.assertEqual(self.scan("child-ignores-term:" + beat)[0], 200)
        time.sleep(0.5)
        stamp = os.stat(beat).st_mtime
        time.sleep(0.6)
        self.assertEqual(os.stat(beat).st_mtime, stamp, "the child still runs")

    def test_a_scanner_that_closes_its_output_early_is_waited_for(self):
        cpu = time.process_time()
        status, body = self.scan("close-early")
        self.assertEqual((status, body["exit"], body["report"]), (200, 3, "{}\n"))
        # Waited for, not spun on: the scanner runs a second after closing its output.
        self.assertLess(time.process_time() - cpu, 0.5)

    def test_a_normal_scan_is_answered_at_once(self):
        # Not after the settle: with it long, a scan that waited for it would take three seconds.
        original = self.service.SETTLE
        self.service.SETTLE = 3
        try:
            start = time.monotonic()
            self.assertEqual(self.scan()[0], 200)
            self.assertLess(time.monotonic() - start, 2)
        finally:
            self.service.SETTLE = original

    def test_refusals_never_leave_the_lock_held(self):
        entry = {"path": "../x", "content": base64.b64encode(b"x").decode()}
        statuses = {self.post({"files": [entry], "timeoutSeconds": 30})[0] for _ in range(200)}
        self.assertEqual(statuses, {400})

    def test_the_lock_is_free_while_an_answer_is_still_going_out(self):
        original = self.service.Handler.answer

        def slow_answer(handler, status, body):
            time.sleep(0.4)
            original(handler, status, body)

        entry = {"path": "../x", "content": base64.b64encode(b"x").decode()}
        self.service.Handler.answer = slow_answer
        try:
            first = threading.Thread(target=self.post, args=({"files": [entry], "timeoutSeconds": 30},))
            first.start()
            time.sleep(0.2)
            self.assertEqual(self.post({"files": [entry], "timeoutSeconds": 30})[0], 400)
            first.join()
        finally:
            self.service.Handler.answer = original

    def test_a_thread_that_cant_start_gives_its_slot_back(self):
        original = threading.Thread.start
        failed = threading.Event()

        def fail_once(thread):
            if not failed.is_set() and thread.name.startswith("Thread"):
                failed.set()
                raise RuntimeError("can't start new thread")
            original(thread)

        saved = os.dup(2)
        devnull = os.open(os.devnull, os.O_WRONLY)
        os.dup2(devnull, 2)
        try:
            for _ in range(self.service.MAX_CONNECTIONS + 1):
                threading.Thread.start = fail_once
                try:
                    with socket.create_connection(("127.0.0.1", self.port), timeout=5) as conn:
                        conn.sendall(b"GET /health HTTP/1.1\r\n\r\n")
                        conn.recv(1024)
                except OSError:
                    pass
                finally:
                    threading.Thread.start = original
                failed.clear()
        finally:
            os.dup2(saved, 2)
            os.close(devnull)
        self.assertEqual(self.scan()[0], 200)

    def test_a_client_that_leaves_early_leaves_no_traceback(self):
        read, write = os.pipe()
        saved = os.dup(2)
        os.dup2(write, 2)
        try:
            # It sends a whole scan and leaves while the scan runs: the answer has nowhere to go.
            body = json.dumps({"files": self.files("close-early"), "timeoutSeconds": 30}).encode()
            with socket.create_connection(("127.0.0.1", self.port), timeout=5) as conn:
                conn.setsockopt(socket.SOL_SOCKET, socket.SO_LINGER, b"\x01\x00\x00\x00\x00\x00\x00\x00")
                conn.sendall(b"POST /scan HTTP/1.1\r\nContent-Length: %d\r\n\r\n" % len(body) + body)
                time.sleep(0.3)
            time.sleep(1.5)
        finally:
            os.dup2(saved, 2)
            os.close(write)
        logged = os.read(read, 65536).decode()
        os.close(read)
        self.assertNotIn("Traceback", logged)
        self.assertNotIn("127.0.0.1", logged)

    def test_connections_beyond_the_cap_are_refused_at_once(self):
        held = [socket.create_connection(("127.0.0.1", self.port)) for _ in range(self.service.MAX_CONNECTIONS)]
        try:
            time.sleep(0.2)
            with socket.create_connection(("127.0.0.1", self.port), timeout=5) as extra:
                extra.sendall(b"GET /health HTTP/1.1\r\n\r\n")
                self.assertIn(b"503", extra.recv(1024))
        finally:
            for conn in held:
                conn.close()
        time.sleep(0.3)
        self.assertEqual(self.scan()[0], 200)

    def test_a_trickling_client_is_cut_off(self):
        with socket.create_connection(("127.0.0.1", self.port), timeout=10) as slow:
            start = time.monotonic()
            try:
                for byte in b"POST /scan HTTP/1.1\r\nContent-Length: 10\r\n\r\n0123456789":
                    slow.sendall(bytes([byte]))
                    time.sleep(1)
            except OSError:
                pass
            self.assertLess(time.monotonic() - start, 8)

    def test_stale_folders_are_swept_and_nothing_else(self):
        root = tempfile.gettempdir()
        stale = tempfile.mkdtemp(prefix="ronne-scan-")
        os.makedirs(os.path.join(stale, "a", "b"))
        os.chmod(os.path.join(stale, "a"), 0o000)
        fresh = tempfile.mkdtemp(prefix="ronne-scan-")
        victim = tempfile.mkdtemp(prefix="victim-")
        inner = os.path.join(victim, "inner")
        os.mkdir(inner, 0o500)
        link = os.path.join(root, "ronne-scan-link-%d" % os.getpid())
        os.symlink(victim, link)
        old = time.time() - self.service.STALE_FOLDER_SECONDS - 60
        try:
            os.utime(stale, (old, old))
            os.utime(link, (old, old), follow_symlinks=False)
            self.assertEqual(self.scan()[0], 200)
            self.assertFalse(os.path.exists(stale))
            self.assertTrue(os.path.isdir(fresh))
            self.assertTrue(os.path.islink(link) and os.path.isdir(victim))
            self.assertEqual(os.stat(inner).st_mode & 0o777, 0o500, "the link's target was changed")
        finally:
            os.unlink(link)
            os.chmod(inner, 0o700)
            os.rmdir(inner)
            os.rmdir(victim)
            os.rmdir(fresh)

    def test_a_scanner_that_cant_run_and_an_unexpected_error_are_answered(self):
        original = self.service.SCANNER
        plain = os.path.join(self.tmp, "plain")
        open(plain, "w").close()
        self.service.SCANNER = plain
        try:
            self.assertEqual(self.scan(), (500, {"error": "not runnable"}))
        finally:
            self.service.SCANNER = original
        run = self.service.run_scan
        self.service.run_scan = lambda *args: 1 / 0
        try:
            self.assertEqual(self.scan(), (500, {"error": "internal"}))
        finally:
            self.service.run_scan = run

    def test_removing_the_folder_never_follows_a_link_out_of_it(self):
        victim = tempfile.mkdtemp(prefix="victim-")
        os.chmod(victim, 0o500)
        try:
            self.assertEqual(self.scan("link-out:" + victim)[0], 200)
            self.assertEqual(os.stat(victim).st_mode & 0o777, 0o500)
        finally:
            os.chmod(victim, 0o700)
            os.rmdir(victim)

    def test_output_over_the_cap(self):
        status, body = self.scan("flood")
        self.assertEqual((status, body["error"]), (502, "output too large"))

    def test_a_missing_scanner_is_answered(self):
        original = self.service.SCANNER
        self.service.SCANNER = os.path.join(self.tmp, "nope")
        try:
            self.assertEqual(self.scan(), (500, {"error": "not found"}))
        finally:
            self.service.SCANNER = original

    def test_one_scan_at_a_time(self):
        original = self.service.run_scan
        started = threading.Event()
        release = threading.Event()

        def slow(*args):
            started.set()
            release.wait(10)
            return {"exit": 0, "report": "{}"}

        self.service.run_scan = slow
        try:
            first = threading.Thread(target=self.scan)
            first.start()
            self.assertTrue(started.wait(5))
            self.assertEqual(self.scan(), (503, {"error": "busy"}))
            release.set()
            first.join()
        finally:
            self.service.run_scan = original

    def test_folder_removed_even_when_the_scanner_locks_it(self):
        before = ronne_folders()
        for mode in ["lock", "lock-deep", "exit2"]:
            self.assertEqual(self.scan(mode)[0], 200, mode)
        self.assertEqual(ronne_folders() - before, set())

    def test_nothing_from_a_request_is_logged(self):
        read, write = os.pipe()
        saved = os.dup(2)
        os.dup2(write, 2)
        try:
            self.scan(semantic=True, provider={"OPENAI_API_KEY": "sk-secret-123"})
            with socket.create_connection(("127.0.0.1", self.port), timeout=5) as conn:
                conn.sendall(b"GET /x\x1b[31mRED HTTP/1.1\r\n\r\n")
                conn.recv(1024)
            with socket.create_connection(("127.0.0.1", self.port), timeout=5) as conn:
                conn.sendall(b"GET /sk-in-a-path?q=sk-in-a-query HTTP/1.1\r\n\r\n")
                conn.recv(1024)
            with socket.create_connection(("127.0.0.1", self.port), timeout=5) as conn:
                conn.sendall(b"SKINAMETHOD /scan HTTP/1.1\r\n\r\n")
                conn.recv(1024)
        finally:
            os.dup2(saved, 2)
            os.close(write)
        logged = os.read(read, 65536).decode()
        os.close(read)
        self.assertIn("POST /scan", logged)
        self.assertNotIn("sk-secret-123", logged)
        self.assertNotIn("SKILL.md", logged)
        self.assertNotIn("\x1b", logged)
        self.assertNotIn("sk-in-a", logged)
        self.assertNotIn("SKINA", logged)
        self.assertIn("GET other", logged)


if __name__ == "__main__":
    unittest.main()
