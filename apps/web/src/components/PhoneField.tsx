import { forwardRef } from "react";
import type { TextFieldProps } from "@mui/material";
import { SanitizedTextField } from "./SanitizedTextField";

function sanitizePhoneInput(value: string) {
  return value.replace(/[^\d+]/g, "");
}

export const PhoneField = forwardRef<HTMLInputElement, TextFieldProps>(function PhoneField(
  { slotProps, ...props },
  ref,
) {
  return (
    <SanitizedTextField
      type="tel"
      {...props}
      ref={ref}
      sanitize={sanitizePhoneInput}
      slotProps={{ ...slotProps, htmlInput: { inputMode: "tel", ...slotProps?.htmlInput } }}
    />
  );
});
