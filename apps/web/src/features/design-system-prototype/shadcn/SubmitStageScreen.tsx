import { projectTypes, structureTypes } from "../data";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

export function SubmitStageScreen() {
  return (
    <div className="mx-auto max-w-2xl bg-slate-50 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Nouvelle demande de stage</CardTitle>
          <CardDescription>
            Parlez-nous de ce stage ! Tous les champs sont requis pour la soumission — vous pouvez
            enregistrer un brouillon à tout moment si vous n'avez pas encore toutes les
            informations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-7" onSubmit={(e) => e.preventDefault()}>
            <fieldset className="flex flex-col gap-4">
              <legend className="text-sm font-semibold text-slate-900">Organisme d'accueil</legend>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="organism-name">Nom de l'organisme</Label>
                <Input id="organism-name" required placeholder="Institut des Jeunes Sourds" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="structure-type">Type de structure</Label>
                  <Select defaultValue={structureTypes[0]}>
                    <SelectTrigger id="structure-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {structureTypes.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="city">Ville</Label>
                  <Input id="city" required placeholder="Lyon" />
                </div>
              </div>
            </fieldset>

            <fieldset className="flex flex-col gap-4">
              <legend className="text-sm font-semibold text-slate-900">Tuteur de stage</legend>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tutor-first-name">Prénom</Label>
                  <Input id="tutor-first-name" required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tutor-last-name">Nom</Label>
                  <Input id="tutor-last-name" required />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tutor-email">E-mail du tuteur</Label>
                <Input id="tutor-email" type="email" required />
              </div>
            </fieldset>

            <fieldset className="flex flex-col gap-4">
              <legend className="text-sm font-semibold text-slate-900">Détails du stage</legend>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="project-type">Type de handicap accompagné</Label>
                <Select defaultValue={projectTypes[0]}>
                  <SelectTrigger id="project-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {projectTypes.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="start-date">Début de période</Label>
                  <Input id="start-date" type="date" required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="end-date">Fin de période</Label>
                  <Input id="end-date" type="date" required />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="motivation">Motivation</Label>
                <textarea
                  id="motivation"
                  required
                  rows={4}
                  className="flex w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300" />
                Stage obligatoire (cursus)
              </label>
            </fieldset>

            <CardFooter className="justify-end gap-3 p-0">
              <Button type="button" variant="outline">
                Enregistrer le brouillon
              </Button>
              <Button type="submit">Soumettre la demande</Button>
            </CardFooter>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
