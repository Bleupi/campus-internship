Ressources à provisionner sur Scaleway (version Serverless SQL DB)

1. Serverless SQL Database — région fr-par (seule région disponible pour ce produit), min_scale=0 pour le scale-to-zero. Pas d'option "Encryption at rest" trouvée pour ce produit dans la console (contrairement à la Managed Database) — rien à cocher là-dessus, ce n'est pas exposé comme réglage pour cette offre.

2. Deux IAM Applications dédiées à la base de données, séparées par privilège (ADR-0022 — jamais une seule clé partagée) :

- `campus-internship-api-runtime` — permission set `ServerlessSQLDatabaseDataReadWrite` (données uniquement, pas de CREATE/ALTER/DROP). Utilisée en continu par le process Nest qui tourne (`DATABASE_URL`).
- `campus-internship-api-migrate` — permission set `ServerlessSQLDatabaseReadWrite` (données + structure). Utilisée uniquement par `docker-entrypoint.sh` au démarrage du conteneur pour `prisma migrate deploy` (`DATABASE_MIGRATE_URL`), jamais par le process qui sert les requêtes.
- Pour chacune : IAM Application non-personnelle (pas ton compte), Policy scopée à cette base précise uniquement (pas d'accès Object Storage, Registry, etc.), puis génération de sa clé API (access key + secret key) → le couple devient user:password dans la connection string Postgres (sslmode=require).
- Ces deux credentials sont configurés directement comme variables d'environnement sur le Serverless Container API (5) — jamais dans les GitHub Actions Secrets (voir point 9 plus bas).

3. Object Storage bucket — créer manuellement en fr-par (nom = ta variable S3_BUCKET, ex. stages-files). Rappel : le code ne le crée pas automatiquement en prod, exprès.

4. Container Registry — un registre Scaleway en fr-par.

5. Deux Serverless Containers (API + web) — en fr-par. Aucun des deux n'a plus besoin d'être rattaché à un Private Network (c'est justement ce que ce changement d'architecture retire). Ils resteront vides tant que le ticket #25 n'aura pas tourné.

6. Domaine personnalisé + TLS — une fois le conteneur API/web créé, attacher le domaine perso depuis la console, récupérer la valeur cible du CNAME, la poser chez OVH, Scaleway gère le Let's Encrypt automatiquement.

7. IAM Application dédiée "CI/CD" (distincte de celle du point 2) :

- Policy scopée au push sur le Container Registry (4) + déploiement sur les deux Serverless Containers (5).
- Explicitement sans droit sur la Serverless SQL Database ni CreateBucket sur l'Object Storage.
- Sa clé API va dans les GitHub Actions Secrets du repo.

8. GitHub Environment production avec toi comme reviewer obligatoire — le gate d'approbation manuelle.

9. Secrets et variables GitHub Actions consommés par `.github/workflows/deploy.yml` (issue #25) — à poser au niveau **repository** (Settings → Secrets and variables → Actions), pas au niveau de l'Environment `production` (8) : le job `build-and-push` n'a pas de gate `environment:` et a quand même besoin de `SCW_SECRET_KEY` pour le `docker login` registry.

- Secrets : `SCW_ACCESS_KEY` et `SCW_SECRET_KEY` — la paire de clé API de l'IAM Application CI/CD (7).
- Variables (non secrètes) : `SCW_PROJECT_ID` (l'UUID du projet Scaleway, visible dans la console) et `VITE_API_BASE_URL` (l'URL publique de l'API, celle du domaine personnalisé une fois (6) posé — baked dans le bundle web au build, donc à tenir à jour si cette URL change).
- Rappel : aucun credential de base de données (2) ne passe par cette liste, quel que soit le point — ADR-0022.

Ordre conseillé:

1. Serverless SQL Database (1)
2. IAM Applications runtime + migrate + Policies + clés (2) — tu en auras besoin pour tester la connexion dès que la base existe
3. Object Storage bucket (3)
4. Container Registry (4)
5. Serverless Containers API + web (5)
6. Domaine + CNAME chez OVH (6)
7. IAM Application CI/CD + Policy + clé (7)
8. GitHub Environment production (8)
9. GitHub Secrets + Variables (9) — dépend de (7) pour les secrets et de (6) pour `VITE_API_BASE_URL`

| Ressource | Nom proposé |
| --- | --- |
| Serverless SQL Database | campus-internship-db-prod |
| IAM Application (runtime, accès DB pour l'API) | campus-internship-api-runtime |
| IAM Application (migrate, accès DB pour l'entrypoint) | campus-internship-api-migrate |
| IAM Application (CI/CD deploy) | campus-internship-ci-deploy |
| Object Storage bucket | campus-internship-files-prod |
| Container Registry (namespace) | campus-internship — images taguées api:\<sha\> / web:\<sha\> dedans |
| Serverless Container API | campus-internship-api-prod |
| Serverless Container web | campus-internship-web-prod |
| GitHub Environment | production (déjà la convention GitHub standard, rien à inventer) |
