/** What the Updates tab's forms answer: a code for the words, under `admin.updates.done`. */
export type UpdatesFormState = {
  done?:
    | "saved"
    | "unchanged"
    | "checked"
    | "newer"
    | "failed"
    | "too_soon"
    | "off_by_environment"
    | "off_by_switch";
};
