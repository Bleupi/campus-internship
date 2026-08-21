import { statusLabels, stageRows, type StageStatus } from "../data";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

const statusTone: Record<StageStatus, "neutral" | "warning" | "success" | "danger"> = {
  DRAFT: "neutral",
  PENDING: "warning",
  VALIDATED: "success",
  REFUSED: "danger",
};

export function DashboardScreen() {
  return (
    <div className="mx-auto max-w-4xl bg-slate-50 p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Mes demandes de stage</h1>
          <p className="mt-1 text-sm text-slate-500">
            Suivez l'avancement de vos stages ci-dessous.
          </p>
        </div>
        <Button>Nouvelle demande</Button>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Liste des demandes de stage de l'étudiant</caption>
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-3">
                Année / semestre
              </th>
              <th scope="col" className="px-4 py-3">
                Organisme
              </th>
              <th scope="col" className="px-4 py-3">
                Période
              </th>
              <th scope="col" className="px-4 py-3">
                Obligatoire
              </th>
              <th scope="col" className="px-4 py-3">
                Statut
              </th>
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {stageRows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3 text-slate-700">
                  {row.schoolYear} · {row.semester}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{row.organismName}</div>
                  <div className="text-slate-500">{row.city}</div>
                </td>
                <td className="px-4 py-3 text-slate-700">{row.periodLabel}</td>
                <td className="px-4 py-3 text-slate-700">{row.mandatory ? "Oui" : "Non"}</td>
                <td className="px-4 py-3">
                  <Badge tone={statusTone[row.status]}>{statusLabels[row.status]}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" size="sm">
                    Voir
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
