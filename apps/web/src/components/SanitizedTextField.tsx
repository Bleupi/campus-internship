import { forwardRef } from "react";
import { TextField, type TextFieldProps } from "@mui/material";

type Props = TextFieldProps & {
  // Maps the raw input value to what the field is allowed to hold.
  sanitize: (value: string) => string;
};

// A TextField that drops disallowed characters as the user types, so they
// never even land in the field. Mutating event.target.value before delegating
// to the caller's onChange (rather than filtering a controlled value) keeps
// this working unchanged with react-hook-form's uncontrolled `register()`
// spread. The `ref` goes to the <input> (via inputRef), not TextField's root
// <div>, because that is where `register()`'s ref has to point for
// react-hook-form to focus the field on a validation error.
export const SanitizedTextField = forwardRef<HTMLInputElement, Props>(function SanitizedTextField(
  { sanitize, onChange, ...props },
  ref,
) {
  return (
    <TextField
      {...props}
      inputRef={ref}
      onChange={(event) => {
        const input = event.target;
        const sanitized = sanitize(input.value);
        if (sanitized !== input.value) {
          // Assigning `value` sends the caret to the end of the field; put it
          // back where the user was, minus the characters dropped before it.
          // (setSelectionRange throws on some input types, e.g. type="email".)
          const caret = sanitize(input.value.slice(0, input.selectionStart ?? 0)).length;
          input.value = sanitized;
          input.setSelectionRange(caret, caret);
        }
        onChange?.(event);
      }}
    />
  );
});
