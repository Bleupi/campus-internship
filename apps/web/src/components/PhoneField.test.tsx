import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { PhoneField } from "./PhoneField";

function RegisteredPhoneField({ onValue }: { onValue: (phone: string) => void }) {
  const { register, handleSubmit } = useForm<{ phone: string }>();
  return (
    <form onSubmit={handleSubmit((values) => onValue(values.phone))}>
      <PhoneField label="Téléphone" {...register("phone")} />
      <button type="submit">Envoyer</button>
    </form>
  );
}

describe("PhoneField", () => {
  it("only allows digits and '+' to be typed", async () => {
    const user = userEvent.setup();
    render(<PhoneField label="Téléphone" />);

    const input = screen.getByLabelText(/téléphone/i);
    await user.type(input, "+33 (0)6 12a34-56b78");

    expect(input).toHaveValue("+330612345678");
  });

  it("hints mobile keyboards to show the phone keypad", () => {
    render(<PhoneField label="Téléphone" />);

    expect(screen.getByLabelText(/téléphone/i)).toHaveAttribute("inputmode", "tel");
  });

  it("forwards the sanitized value to the react-hook-form register() handlers", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<RegisteredPhoneField onValue={onValue} />);

    await user.type(screen.getByLabelText(/téléphone/i), "06ab12cd34");
    await user.click(screen.getByRole("button", { name: /envoyer/i }));

    expect(onValue).toHaveBeenCalledWith("061234");
  });
});
