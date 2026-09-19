import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Autocomplete,
  Button,
  Chip,
  Divider,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import {
  hostOrganismInputSchema,
  tutorInputSchema,
  type CreateStageDraftInput,
  type HostOrganismInput,
  type OrganismSearchResultItem,
  type OrganismTutorSummary,
  type TutorInput,
} from "shared";
import { PhoneField } from "../../components/PhoneField";
import { useOrganism } from "../organisms/useOrganism";
import { useOrganismSearch } from "../organisms/useOrganismSearch";
import { useStructureTypes } from "../organisms/useStructureTypes";
import { formatOrganismAddress } from "./format-summary";

type OrganismSelection = CreateStageDraftInput["organism"];
type TutorSelection = CreateStageDraftInput["tutor"];

// An untouched, empty phone field must submit as undefined (a valid
// "no value" for this optional field), not "" — which frenchMobilePhoneSchema
// rejects (same pattern as ProfilePage's emptyToNull for the same schema).
function emptyToUndefined(value: string | null | undefined) {
  return value === "" ? undefined : value;
}

interface Props {
  organism: OrganismSelection | null;
  tutor: TutorSelection | null;
  onChange: (organism: OrganismSelection | null, tutor: TutorSelection | null) => void;
}

function OrganismCreationForm({ onCreated }: { onCreated: (data: HostOrganismInput) => void }) {
  const structureTypes = useStructureTypes();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<HostOrganismInput>({ resolver: zodResolver(hostOrganismInputSchema) });

  return (
    <Stack
      component="form"
      spacing={2}
      onSubmit={handleSubmit(onCreated)}
      sx={{ pl: 2, borderLeft: "3px solid", borderColor: "divider" }}
    >
      <Typography variant="subtitle2">Nouvel organisme</Typography>
      <TextField
        label="Nom de l'organisme"
        {...register("name")}
        error={!!errors.name}
        helperText={errors.name?.message}
      />
      <TextField
        select
        label="Type de structure"
        defaultValue=""
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
        <TextField
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
        Valider ce nouvel organisme
      </Button>
    </Stack>
  );
}

function TutorCreationForm({ onCreated }: { onCreated: (data: TutorInput) => void }) {
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
    defaultValues: { acceptsPhoneContact: false },
  });

  return (
    <Stack
      component="form"
      spacing={2}
      onSubmit={handleSubmit(onCreated)}
      sx={{ pl: 2, borderLeft: "3px solid", borderColor: "divider" }}
    >
      <Typography variant="subtitle2">Nouveau tuteur</Typography>
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
        Valider ce nouveau tuteur
      </Button>
    </Stack>
  );
}

export function OrganismTutorStep({ organism, tutor, onChange }: Props) {
  const [searchText, setSearchText] = useState("");
  const [creatingOrganism, setCreatingOrganism] = useState(false);
  const [creatingTutor, setCreatingTutor] = useState(false);

  const search = useOrganismSearch(searchText);
  const existingOrganismId = organism?.mode === "existing" ? organism.id : null;
  const organismDetail = useOrganism(existingOrganismId);

  function selectExistingOrganism(item: OrganismSearchResultItem) {
    setCreatingOrganism(false);
    onChange({ mode: "existing", id: item.id }, null);
  }

  function createOrganism(data: HostOrganismInput) {
    setCreatingOrganism(false);
    onChange({ mode: "new", data }, null);
  }

  function selectExistingTutor(item: OrganismTutorSummary) {
    setCreatingTutor(false);
    onChange(organism, { mode: "existing", id: item.id });
  }

  function createTutor(data: TutorInput) {
    setCreatingTutor(false);
    onChange(organism, { mode: "new", data });
  }

  const tutorOptions: OrganismTutorSummary[] = organismDetail.data?.tutors ?? [];

  return (
    <Stack spacing={3} sx={{ maxWidth: 480 }}>
      <Stack spacing={1.5}>
        <Typography variant="subtitle1">Organisme d'accueil</Typography>
        {organism === null && !creatingOrganism && (
          <>
            <Autocomplete
              options={search.data ?? []}
              getOptionLabel={(option) => option.name}
              loading={search.isFetching}
              // The search only runs once there is text (useOrganismSearch), so an
              // untouched picker has "no results" only because nothing was asked.
              noOptionsText={
                searchText.trim() === ""
                  ? "Taper un caractère pour commencer la recherche"
                  : "Aucun résultat"
              }
              onInputChange={(_, value) => setSearchText(value)}
              onChange={(_, value) => {
                if (value) selectExistingOrganism(value);
              }}
              renderInput={(params) => <TextField {...params} label="Rechercher un organisme" />}
            />
            <Button
              variant="outlined"
              startIcon={<AddOutlined />}
              onClick={() => setCreatingOrganism(true)}
              sx={{ alignSelf: "flex-start" }}
            >
              Créer un nouvel Organisme
            </Button>
          </>
        )}
        {creatingOrganism && <OrganismCreationForm onCreated={createOrganism} />}
        {organism !== null && (
          <Stack spacing={0.5}>
            {organism.mode === "existing" && organismDetail.data && (
              <>
                <Typography variant="body1">{organismDetail.data.name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatOrganismAddress(organismDetail.data)}
                </Typography>
              </>
            )}
            {organism.mode === "new" && (
              <>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Typography variant="body1">{organism.data.name}</Typography>
                  <Chip size="small" color="info" variant="outlined" label="nouvel organisme" />
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {formatOrganismAddress(organism.data)}
                </Typography>
              </>
            )}
            <Button
              size="small"
              onClick={() => onChange(null, null)}
              sx={{ alignSelf: "flex-start" }}
            >
              Changer d'organisme
            </Button>
          </Stack>
        )}
      </Stack>

      {organism !== null && (
        <>
          <Divider />
          <Stack spacing={1.5}>
            <Typography variant="subtitle1">Tuteur de stage</Typography>
            {tutor === null && !creatingTutor && (
              <>
                <Autocomplete
                  options={tutorOptions}
                  getOptionLabel={(option) => `${option.firstName} ${option.lastName}`}
                  noOptionsText="Aucun tuteur pour cet organisme"
                  onChange={(_, value) => {
                    if (value) selectExistingTutor(value);
                  }}
                  renderInput={(params) => <TextField {...params} label="Sélectionner un tuteur" />}
                />
                <Button
                  variant="outlined"
                  startIcon={<AddOutlined />}
                  onClick={() => setCreatingTutor(true)}
                  sx={{ alignSelf: "flex-start" }}
                >
                  Créer un nouveau Tuteur
                </Button>
              </>
            )}
            {creatingTutor && <TutorCreationForm onCreated={createTutor} />}
            {tutor !== null && (
              <Stack spacing={0.5}>
                {tutor.mode === "existing" &&
                  tutorOptions
                    .filter((t) => t.id === tutor.id)
                    .map((t) => (
                      <Typography key={t.id} variant="body1">
                        {t.firstName} {t.lastName} ({t.jobTitle})
                      </Typography>
                    ))}
                {tutor.mode === "new" && (
                  <Typography variant="body1">
                    {tutor.data.firstName} {tutor.data.lastName} ({tutor.data.jobTitle}, nouveau
                    tuteur)
                  </Typography>
                )}
                <Button
                  size="small"
                  onClick={() => onChange(organism, null)}
                  sx={{ alignSelf: "flex-start" }}
                >
                  Changer de tuteur
                </Button>
              </Stack>
            )}
          </Stack>
        </>
      )}
    </Stack>
  );
}
