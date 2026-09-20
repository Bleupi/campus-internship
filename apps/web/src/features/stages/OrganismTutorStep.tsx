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
import EditOutlined from "@mui/icons-material/EditOutlined";
import {
  hostOrganismInputSchema,
  tutorInputSchema,
  type HostOrganismInput,
  type OrganismSearchResultItem,
  type OrganismTutorSummary,
  type TutorInput,
} from "shared";
import { PhoneField } from "../../components/PhoneField";
import { PostalCodeField } from "../../components/PostalCodeField";
import { useOrganism } from "../organisms/useOrganism";
import { useOrganismSearch } from "../organisms/useOrganismSearch";
import { useStructureTypes } from "../organisms/useStructureTypes";
import { formatOrganismAddress } from "./format-summary";

import type { OrganismSelection, TutorSelection } from "./StageWizard";

// An untouched, empty phone field must submit as undefined (a valid
// "no value" for this optional field), not "" — which frenchMobilePhoneSchema
// rejects (same pattern as ProfilePage's emptyToNull for the same schema).
function emptyToUndefined(value: string | null | undefined) {
  return value === "" ? undefined : value;
}

// Which inline form is open, if any: creating a new organism/tutor, or
// correcting the draft's own in place (issue #116). Owned by the wizard (not
// this step) so its "Précédent" button can close the form instead of being dead.
export type CreationMode = "organism" | "tutor" | "edit-organism" | "edit-tutor" | null;

// The organism and tutor a reopened draft points to, and whether each may still
// be corrected in place (unfrozen) or the student must create a new one.
interface DraftRow {
  id: string;
  editable: boolean;
}
export interface DraftRows {
  organism: DraftRow;
  tutor: DraftRow;
}

interface Props {
  organism: OrganismSelection | null;
  tutor: TutorSelection | null;
  onChange: (organism: OrganismSelection | null, tutor: TutorSelection | null) => void;
  creating: CreationMode;
  onCreatingChange: (creating: CreationMode) => void;
  draftRows?: DraftRows;
}

interface FormProps<T> {
  heading: string;
  submitLabel: string;
  defaultValues?: T;
  onSubmit: (data: T) => void;
}

// Creates a new organism, or (with defaultValues) corrects the draft's own.
function OrganismForm({
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
function TutorForm({ heading, submitLabel, defaultValues, onSubmit }: FormProps<TutorInput>) {
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

export function OrganismTutorStep({
  organism,
  tutor,
  onChange,
  creating,
  onCreatingChange,
  draftRows,
}: Props) {
  const [searchText, setSearchText] = useState("");
  const creatingOrganism = creating === "organism";
  const creatingTutor = creating === "tutor";
  const editingOrganism = creating === "edit-organism";
  const editingTutor = creating === "edit-tutor";

  const search = useOrganismSearch(searchText);
  const organismId = organism !== null && organism.mode !== "new" ? organism.id : null;
  const organismDetail = useOrganism(organismId);

  function selectExistingOrganism(item: OrganismSearchResultItem) {
    onCreatingChange(null);
    onChange({ mode: "existing", id: item.id }, null);
  }

  function createOrganism(data: HostOrganismInput) {
    onCreatingChange(null);
    onChange({ mode: "new", data }, null);
  }

  function selectExistingTutor(item: OrganismTutorSummary) {
    onCreatingChange(null);
    onChange(organism, { mode: "existing", id: item.id });
  }

  function createTutor(data: TutorInput) {
    onCreatingChange(null);
    onChange(organism, { mode: "new", data });
  }

  // Correcting a row is only ever offered on the one the reopened draft points
  // to. Whether it is still allowed (unfrozen) comes from the server; when not,
  // the student is steered to the "create a new one" sub-step instead.
  const ownOrganism = draftRows !== undefined && organismId === draftRows.organism.id;
  const ownTutor =
    draftRows !== undefined &&
    tutor !== null &&
    tutor.mode !== "new" &&
    tutor.id === draftRows.tutor.id;

  function editOrganism(data: HostOrganismInput) {
    onCreatingChange(null);
    onChange({ mode: "edit", id: draftRows!.organism.id, data }, tutor);
  }

  function editTutor(data: TutorInput) {
    onCreatingChange(null);
    onChange(organism, { mode: "edit", id: draftRows!.tutor.id, data });
  }

  const tutorOptions: OrganismTutorSummary[] = organismDetail.data?.tutors ?? [];
  const organismFormDefaults: HostOrganismInput | undefined =
    organism?.mode === "edit" ? organism.data : organismDetail.data;
  const tutorFormDefaults: TutorInput | undefined =
    tutor?.mode === "edit"
      ? tutor.data
      : tutorOptions.find((t) => tutor?.mode === "existing" && t.id === tutor.id);

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
              onClick={() => onCreatingChange("organism")}
              sx={{ alignSelf: "flex-start" }}
            >
              Créer un nouvel Organisme
            </Button>
          </>
        )}
        {creatingOrganism && (
          <OrganismForm
            heading="Nouvel organisme"
            submitLabel="Valider ce nouvel organisme"
            onSubmit={createOrganism}
          />
        )}
        {editingOrganism && (
          <OrganismForm
            heading="Modifier l'organisme"
            submitLabel="Valider les modifications"
            defaultValues={organismFormDefaults}
            onSubmit={editOrganism}
          />
        )}
        {organism !== null && !editingOrganism && (
          <Stack spacing={0.5}>
            {organism.mode === "existing" && organismDetail.data && (
              <>
                <Typography variant="body1">{organismDetail.data.name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatOrganismAddress(organismDetail.data)}
                </Typography>
              </>
            )}
            {organism.mode !== "existing" && (
              <>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Typography variant="body1">{organism.data.name}</Typography>
                  {organism.mode === "new" && (
                    <Chip size="small" color="info" variant="outlined" label="nouvel organisme" />
                  )}
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {formatOrganismAddress(organism.data)}
                </Typography>
              </>
            )}
            {ownOrganism && draftRows.organism.editable && (
              <Button
                size="small"
                startIcon={<EditOutlined />}
                onClick={() => onCreatingChange("edit-organism")}
                sx={{ alignSelf: "flex-start" }}
              >
                Modifier l'organisme
              </Button>
            )}
            {ownOrganism && !draftRows.organism.editable && (
              <Typography variant="body2" color="text.secondary">
                Cet organisme est utilisé par d'autres demandes, il ne peut plus être modifié. Pour
                corriger ses informations, changez d'organisme puis créez-en un nouveau.
              </Typography>
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
                  onClick={() => onCreatingChange("tutor")}
                  sx={{ alignSelf: "flex-start" }}
                >
                  Créer un nouveau Tuteur
                </Button>
              </>
            )}
            {creatingTutor && (
              <TutorForm
                heading="Nouveau tuteur"
                submitLabel="Valider ce nouveau tuteur"
                onSubmit={createTutor}
              />
            )}
            {editingTutor && (
              <TutorForm
                heading="Modifier le tuteur"
                submitLabel="Valider les modifications"
                defaultValues={tutorFormDefaults}
                onSubmit={editTutor}
              />
            )}
            {tutor !== null && !editingTutor && (
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
                {tutor.mode === "edit" && (
                  <Typography variant="body1">
                    {tutor.data.firstName} {tutor.data.lastName} ({tutor.data.jobTitle})
                  </Typography>
                )}
                {ownTutor && draftRows.tutor.editable && (
                  <Button
                    size="small"
                    startIcon={<EditOutlined />}
                    onClick={() => onCreatingChange("edit-tutor")}
                    sx={{ alignSelf: "flex-start" }}
                  >
                    Modifier le tuteur
                  </Button>
                )}
                {ownTutor && !draftRows.tutor.editable && (
                  <Typography variant="body2" color="text.secondary">
                    Ce tuteur est utilisé par d'autres demandes, il ne peut plus être modifié. Pour
                    corriger ses informations, changez de tuteur puis créez-en un nouveau.
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
