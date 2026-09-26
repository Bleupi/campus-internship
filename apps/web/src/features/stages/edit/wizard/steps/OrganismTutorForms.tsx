import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import {
  hostOrganismInputSchema,
  tutorInputSchema,
  type HostOrganismInput,
  type TutorInput,
} from "shared";
import { PhoneField } from "../../../../../components/PhoneField";
import { PostalCodeField } from "../../../../../components/PostalCodeField";
import { useStructureTypes } from "../../../../organisms/useStructureTypes";

// An untouched, empty phone field must submit as undefined (a valid
// "no value" for this optional field), not "" — which frenchMobilePhoneSchema
// rejects (same pattern as ProfilePage's emptyToNull for the same schema).
function emptyToUndefined(value: string | null | undefined) {
  return value === "" ? undefined : value;
}

interface FormProps<T> {
  heading: string;
  submitLabel: string;
  defaultValues?: T;
  onSubmit: (data: T) => void;
}

// Creates a new organism, or (with defaultValues) corrects the draft's own.
export function OrganismForm({
  heading,
  submitLabel,
  defaultValues,
  onSubmit,
}: FormProps<HostOrganismInput>) {
  const structureTypes = useStructureTypes();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<HostOrganismInput>({
    resolver: zodResolver(hostOrganismInputSchema),
    defaultValues,
  });

  return (
    <Stack
      component="form"
      spacing={2}
      onSubmit={handleSubmit(onSubmit)}
      sx={{ pl: 2, borderLeft: "3px solid", borderColor: "divider" }}
    >
      <Typography variant="subtitle2">{heading}</Typography>
      <TextField
        label="Nom de l'organisme"
        {...register("name")}
        error={!!errors.name}
        helperText={errors.name?.message}
      />
      <TextField
        select
        label="Type de structure"
        defaultValue={defaultValues?.structureType ?? ""}
        {...register("structureType")}
        error={!!errors.structureType}
        helperText={errors.structureType?.message}
      >
        {(structureTypes.data ?? []).map((type) => (
          <MenuItem key={type.id} value={type.label}>
            {type.label}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label="Adresse"
        {...register("street")}
        error={!!errors.street}
        helperText={errors.street?.message}
      />
      <Stack direction="row" spacing={2}>
        <PostalCodeField
          label="Code postal"
          {...register("postalCode")}
          error={!!errors.postalCode}
          helperText={errors.postalCode?.message}
        />
        <TextField
          label="Ville"
          fullWidth
          {...register("city")}
          error={!!errors.city}
          helperText={errors.city?.message}
        />
      </Stack>
      <Button type="submit" variant="outlined" sx={{ alignSelf: "flex-start" }}>
        {submitLabel}
      </Button>
    </Stack>
  );
}

// Creates a new tutor, or (with defaultValues) corrects the draft's own.
export function TutorForm({
  heading,
  submitLabel,
  defaultValues,
  onSubmit,
}: FormProps<TutorInput>) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<TutorInput>({
    resolver: (values, context, options) =>
      zodResolver(tutorInputSchema)(
        { ...values, phone: emptyToUndefined(values.phone) },
        context,
        options,
      ),
    defaultValues: { acceptsPhoneContact: false, ...defaultValues },
  });

  return (
    <Stack
      component="form"
      spacing={2}
      onSubmit={handleSubmit(onSubmit)}
      sx={{ pl: 2, borderLeft: "3px solid", borderColor: "divider" }}
    >
      <Typography variant="subtitle2">{heading}</Typography>
      <Stack direction="row" spacing={2}>
        <TextField
          label="Prénom"
          fullWidth
          {...register("firstName")}
          error={!!errors.firstName}
          helperText={errors.firstName?.message}
        />
        <TextField
          label="Nom"
          fullWidth
          {...register("lastName")}
          error={!!errors.lastName}
          helperText={errors.lastName?.message}
        />
      </Stack>
      <TextField
        label="Email"
        {...register("email")}
        error={!!errors.email}
        helperText={errors.email?.message}
      />
      <TextField
        label="Fonction"
        {...register("jobTitle")}
        error={!!errors.jobTitle}
        helperText={errors.jobTitle?.message}
      />
      <PhoneField
        label="Téléphone (facultatif)"
        {...register("phone")}
        error={!!errors.phone}
        helperText={errors.phone?.message}
      />
      <Controller
        name="acceptsPhoneContact"
        control={control}
        render={({ field }) => (
          <FormControlLabel
            control={
              <Switch checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />
            }
            label="Accepte d'être contacté par téléphone"
          />
        )}
      />
      <Button type="submit" variant="outlined" sx={{ alignSelf: "flex-start" }}>
        {submitLabel}
      </Button>
    </Stack>
  );
}
