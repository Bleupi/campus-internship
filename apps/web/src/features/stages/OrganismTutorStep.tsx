import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Autocomplete,
  Button,
  Chip,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  hostOrganismInputSchema,
  tutorInputSchema,
  type CreateStageDraftInput,
  type HostOrganismInput,
  type OrganismSearchResultItem,
  type OrganismTutorSummary,
  type TutorInput,
} from "shared";
import { useOrganism } from "../organisms/useOrganism";
import { useOrganismSearch } from "../organisms/useOrganismSearch";
import { useStructureTypes } from "../organisms/useStructureTypes";

type OrganismSelection = CreateStageDraftInput["organism"];
type TutorSelection = CreateStageDraftInput["tutor"];

const CREATE_NEW_ORGANISM = {
  id: "__create_new__",
  name: "Aucun de ceux-ci — créer un nouvel organisme",
};
const CREATE_NEW_TUTOR = { id: "__create_new__", label: "Nouveau tuteur" };

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
      <TextField
        label="Téléphone (facultatif)"
        {...register("phone")}
        error={!!errors.phone}
        helperText={errors.phone?.message}
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
          <Autocomplete
            options={[...(search.data ?? []), CREATE_NEW_ORGANISM]}
            getOptionLabel={(option) => option.name}
            loading={search.isFetching}
            noOptionsText="Aucun résultat"
            onInputChange={(_, value) => setSearchText(value)}
            onChange={(_, value) => {
              if (!value) return;
              if (value.id === CREATE_NEW_ORGANISM.id) {
                setCreatingOrganism(true);
              } else {
                selectExistingOrganism(value as OrganismSearchResultItem);
              }
            }}
            renderInput={(params) => <TextField {...params} label="Rechercher un organisme" />}
          />
        )}
        {creatingOrganism && <OrganismCreationForm onCreated={createOrganism} />}
        {organism !== null && (
          <Stack spacing={0.5}>
            {organism.mode === "existing" && organismDetail.data && (
              <>
                <Typography variant="body1">{organismDetail.data.name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {organismDetail.data.structureType} · {organismDetail.data.street},{" "}
                  {organismDetail.data.postalCode} {organismDetail.data.city}
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
                  {organism.data.structureType} · {organism.data.street}, {organism.data.postalCode}{" "}
                  {organism.data.city}
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
              <Autocomplete
                options={[...tutorOptions, CREATE_NEW_TUTOR]}
                getOptionLabel={(option) =>
                  "label" in option ? option.label : `${option.firstName} ${option.lastName}`
                }
                noOptionsText="Aucun tuteur pour cet organisme"
                onChange={(_, value) => {
                  if (!value) return;
                  if (value.id === CREATE_NEW_TUTOR.id) {
                    setCreatingTutor(true);
                  } else {
                    selectExistingTutor(value as OrganismTutorSummary);
                  }
                }}
                renderInput={(params) => <TextField {...params} label="Sélectionner un tuteur" />}
              />
            )}
            {creatingTutor && <TutorCreationForm onCreated={createTutor} />}
            {tutor !== null && (
              <Stack spacing={0.5}>
                {tutor.mode === "existing" &&
                  tutorOptions
                    .filter((t) => t.id === tutor.id)
                    .map((t) => (
                      <Typography key={t.id} variant="body1">
                        {t.firstName} {t.lastName} — {t.jobTitle}
                      </Typography>
                    ))}
                {tutor.mode === "new" && (
                  <Typography variant="body1">
                    {tutor.data.firstName} {tutor.data.lastName} — {tutor.data.jobTitle} (nouveau
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
