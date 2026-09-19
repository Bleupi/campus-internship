import { forwardRef } from "react";
import { TextField, type TextFieldProps } from "@mui/material";

// Strips everything but digits and "+" as the user types, so a letter never
// even lands in the field. Mutating event.target.value before delegating to
// the caller's onChange (rather than filtering a controlled value) keeps this
// working unchanged with react-hook-form's uncontrolled `register()` spread.
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
        event.target.value = sanitizePhoneInput(event.target.value);
        onChange?.(event);
      }}
    />
  );
});
