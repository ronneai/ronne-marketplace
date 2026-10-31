import { type FormEvent, useActionState, useTransition } from "react";

/**
 * `useActionState` for a form whose fields must stay as they are after a save (138). React resets a
 * form once its action is done, which unticked a controlled radio or checkbox that had just been
 * saved until the page was read again. With JavaScript the action is sent from `onSubmit`, in a
 * transition, so nothing is reset; without it, the form's own `action` posts as usual. Put
 * `action={action} onSubmit={onSubmit}` on the form.
 */
export const useKeptActionState = <State>(
  action: (previous: Awaited<State>, form: FormData) => State | Promise<State>,
  initial: Awaited<State>,
) => {
  const [state, run, pending] = useActionState(action, initial);
  const [, startTransition] = useTransition();
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // The button that was pressed goes with the fields, as it would in a plain post.
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(event.currentTarget, submitter);
    startTransition(() => run(data));
  };
  return { state, action: run, pending, onSubmit };
};
