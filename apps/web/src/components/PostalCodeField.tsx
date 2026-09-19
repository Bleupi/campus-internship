import { forwardRef } from "react";
import type { TextFieldProps } from "@mui/material";
import { SanitizedTextField } from "./SanitizedTextField";

// French postal codes: exactly five digits (the length itself is enforced by
// postalCode's shared Zod schema; maxLength here just stops typing at 5).
function sanitizePostalCodeInput(value: string) {
  return value.replace(/\D/g, "");
}

export const PostalCodeField = forwardRef<HTMLInputElement, TextFieldProps>(
  function PostalCodeField({ slotProps, ...props }, ref) {
    return (
      <SanitizedTextField
        {...props}
        ref={ref}
        sanitize={sanitizePostalCodeInput}
        slotProps={{
          ...slotProps,
          htmlInput: { inputMode: "numeric", maxLength: 5, ...slotProps?.htmlInput },
        }}
      />
    );
  },
);
