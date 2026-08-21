import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function LoginScreen() {
  return (
    <div className="flex min-h-[600px] items-center justify-center bg-slate-50 p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="pb-2">
          <CardTitle>Gestion des stages</CardTitle>
          <CardDescription>
            Content de vous revoir ! Connectez-vous pour retrouver vos demandes de stage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => e.preventDefault()}
            aria-label="Formulaire de connexion"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Adresse e-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                placeholder="prenom.nom@etu.univ.fr"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" type="password" autoComplete="current-password" required />
            </div>
            <Button type="submit" className="mt-2">
              Se connecter
            </Button>
            <a
              href="#"
              className="text-center text-sm text-slate-500 underline-offset-4 hover:underline"
            >
              Mot de passe oublié ?
            </a>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
