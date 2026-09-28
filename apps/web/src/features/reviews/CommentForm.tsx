"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError, inputClasses, Label } from "@/components/ui/Field";
import { commentFromForm } from "./actions";
import type { ReviewActionState } from "./types";

/** Adds a comment to the conversation; the form clears once it's posted. */
export const CommentForm = ({ id }: { id: string }) => {
  const [state, action, pending] = useActionState<ReviewActionState, FormData>(
    commentFromForm.bind(null, id),
    {},
  );
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.done) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="grid gap-2">
      <Label htmlFor="comment-body">Comment</Label>
      <textarea
        id="comment-body"
        name="body"
        rows={3}
        maxLength={5000}
        required
        aria-describedby="comment-error"
        className={`${inputClasses} h-auto py-2`}
      />
      <FieldError id="comment-error">{state.error}</FieldError>
      <div>
        <Button type="submit" variant="secondary" loading={pending}>
          Comment
        </Button>
      </div>
    </form>
  );
};
