import { forwardRef } from "react";
import { TextField, type TextFieldProps } from "@mui/material";

// Strips everything but digits and "+" as the user types, so a letter never
// even lands in the field. Mutating event.target.value before delegating to
// the caller's onChange (rather than filtering a controlled value) keeps this
// working unchanged with react-hook-form's uncontrolled `register()` spread.
// `type="tel"` matters here: setSelectionRange throws on e.g. type="email".
function sanitizePhoneInput(value: string) {
  return value.replace(/[^\d+]/g, "");
}

// The `ref` goes to the <input> (via inputRef), not TextField's root <div>,
// because that is where `register()`'s ref has to point for react-hook-form
// to focus the field on a validation error.
export const PhoneField = forwardRef<HTMLInputElement, TextFieldProps>(function PhoneField(
  { onChange, slotProps, ...props },
  ref,
) {
  return (
    <TextField
      type="tel"
      {...props}
      inputRef={ref}
      slotProps={{ ...slotProps, htmlInput: { inputMode: "tel", ...slotProps?.htmlInput } }}
      onChange={(event) => {
        const input = event.target;
        const sanitized = sanitizePhoneInput(input.value);
        if (sanitized !== input.value) {
          // Assigning `value` sends the caret to the end of the field; put it
          // back where the user was, minus the characters dropped before it.
          const caret = sanitizePhoneInput(input.value.slice(0, input.selectionStart ?? 0)).length;
          input.value = sanitized;
          input.setSelectionRange(caret, caret);
        }
        onChange?.(event);
      }}
    />
  );
});
