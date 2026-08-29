Ressources à provisionner sur Scaleway (version Serverless SQL DB)

1. Serverless SQL Database — région fr-par (seule région disponible pour ce produit), min_scale=0 pour le scale-to-zero. Pas d'option "Encryption at rest" trouvée pour ce produit dans la console (contrairement à la Managed Database) — rien à cocher là-dessus, ce n'est pas exposé comme réglage pour cette offre.

2. Deux IAM Applications dédiées à la base de données, séparées par privilège (ADR-0022 — jamais une seule clé partagée) :

- `campus-internship-api-runtime` — permission set `ServerlessSQLDatabaseDataReadWrite` (données uniquement, pas de CREATE/ALTER/DROP). Utilisée en continu par le process Nest qui tourne (`DATABASE_URL`).
- `campus-internship-api-migrate` — permission set `ServerlessSQLDatabaseReadWrite` (données + structure). Utilisée uniquement par `docker-entrypoint.sh` au démarrage du conteneur pour `prisma migrate deploy` (`DATABASE_MIGRATE_URL`), jamais par le process qui sert les requêtes.
- Pour chacune : IAM Application non-personnelle (pas ton compte), Policy scopée à cette base précise uniquement (pas d'accès Object Storage, Registry, etc.), puis génération de sa clé API (access key + secret key) → le couple devient user:password dans la connection string Postgres (sslmode=require).
- Ces deux credentials sont configurés directement comme variables d'environnement sur le Serverless Container API (5) — jamais dans les GitHub Actions Secrets (voir point 9 plus bas).
- **Les deux clés (runtime ET migrate) doivent être posées sur le container en même temps, dès sa création** — pas migrate "plus tard". `docker-entrypoint.sh` retombe sur `DATABASE_URL` (runtime) si `DATABASE_MIGRATE_URL` est absent, et la clé runtime n'a pas les droits DDL : sans migrate dès le premier boot, `prisma migrate deploy` échoue à la toute première table (aucune table n'existe encore sur une base neuve).

3. Object Storage bucket — créer manuellement en fr-par (nom = ta variable S3_BUCKET, ex. stages-files). Rappel : le code ne le crée pas automatiquement en prod, exprès.

- **IAM Application dédiée à ce bucket, non documentée jusqu'ici** — ni ADR-0020 ni ADR-0021 ne précisent ce credential. Par cohérence avec le split par privilège du point 2, créer une troisième IAM Application (`campus-internship-api-storage`), Policy scopée en lecture/écriture sur ce bucket précis uniquement (pas de `CreateBucket`), clé API → `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`, posée en secret-environment-variable sur le Serverless Container API (5), jamais dans les GitHub Actions Secrets — même logique que le point 2.

4. Container Registry — un registre Scaleway en fr-par.

5. Un Containers Namespace, puis deux Serverless Containers (API + web) dedans — en fr-par. **Le namespace est une ressource à part, distincte du Container Registry namespace (4)** — `scw container container create` exige un `namespace-id` existant, donc `scw container namespace create name=campus-internship-prod region=fr-par project-id=<PROJECT_ID>` (ou l'équivalent console) est un préalable, pas optionnel. Nommé avec le suffixe d'environnement (comme les containers eux-mêmes, cf. tableau) pour ne pas avoir à migrer le jour où un namespace `-preprod` est ajouté.

- Aucun des deux n'a plus besoin d'être rattaché à un Private Network (c'est justement ce que ce changement d'architecture retire).
- **Un container ne peut pas être créé "vide" — il lui faut une `registry-image` valide dès sa création.** Comme `.github/workflows/deploy.yml` ne fait que `update` un container déjà existant (recherché par nom), la toute première image de chaque doit être poussée à la main avant de créer les containers : build + push (voir la commande `docker login`/`docker build`/`docker push` fournie séparément), puis `scw container container create ... registry-image=<cette image bootstrap>`. Une fois les deux containers créés, tous les déploiements suivants passent par le workflow automatiquement.

6. Domaine personnalisé + TLS — une fois le conteneur API/web créé, attacher le domaine perso depuis la console, récupérer la valeur cible du CNAME, la poser chez OVH, Scaleway gère le Let's Encrypt automatiquement.

7. IAM Application dédiée "CI/CD" (distincte de celle du point 2) :

- Policy scopée au push sur le Container Registry (4) + déploiement sur les deux Serverless Containers (5).
- Explicitement sans droit sur la Serverless SQL Database ni CreateBucket sur l'Object Storage.
- Sa clé API va dans les GitHub Actions Secrets du repo.
- **Piège vécu** : le scope d'une Policy Scaleway IAM ne va pas plus fin que Project (voir doc IAM officielle) — Container Registry n'a pas encore de scoping par namespace (`resource.id`), c'est une feature request encore ouverte côté Scaleway. Une condition `resource.id == <namespace-id>` ajoutée sur la Policy bloque silencieusement tout le flow d'auth `docker login`/`scw` (401 générique, aucun message explicite) sans jamais être le mécanisme qui accorde l'accès. Le scope correct est simplement "This project" = celui qui contient le namespace Registry (4), sans condition additionnelle.

8. GitHub Environment production avec toi comme reviewer obligatoire — le gate d'approbation manuelle.

9. Secrets et variables GitHub Actions consommés par `.github/workflows/deploy.yml` (issue #25) — à poser au niveau **repository** (Settings → Secrets and variables → Actions), pas au niveau de l'Environment `production` (8) : le job `build-and-push` n'a pas de gate `environment:` et a quand même besoin de `SCW_SECRET_KEY` pour le `docker login` registry.

- Secrets : `SCW_ACCESS_KEY` et `SCW_SECRET_KEY` — la paire de clé API de l'IAM Application CI/CD (7).
- Variables (non secrètes) : `SCW_PROJECT_ID` (l'UUID du projet Scaleway, visible dans la console) et `VITE_API_BASE_URL` (l'URL publique de l'API, celle du domaine personnalisé une fois (6) posé — baked dans le bundle web au build, donc à tenir à jour si cette URL change).
- Rappel : aucun credential de base de données (2) ne passe par cette liste, quel que soit le point — ADR-0022.

Ordre conseillé:

1. Serverless SQL Database (1)
2. IAM Applications runtime + migrate + Policies + clés (2) — tu en auras besoin pour tester la connexion dès que la base existe
3. Object Storage bucket + IAM Application storage (3)
4. Container Registry (4)
5. IAM Application CI/CD + Policy + clé (7) — nécessaire pour le `docker login` du bootstrap juste après
6. Bootstrap manuel : build + push les deux premières images, puis Containers Namespace + Serverless Containers API + web (5), env vars posées à la création
7. Domaine + CNAME chez OVH (6)
8. GitHub Environment production (8)
9. GitHub Secrets + Variables (9) — dépend de (7) pour les secrets et de (6)/(5) pour `VITE_API_BASE_URL`

| Ressource | Nom proposé |
| --- | --- |
| Serverless SQL Database | campus-internship-db-prod |
| IAM Application (runtime, accès DB pour l'API) | campus-internship-api-runtime |
| IAM Application (migrate, accès DB pour l'entrypoint) | campus-internship-api-migrate |
| IAM Application (storage, accès bucket pour l'API) | campus-internship-api-storage |
| IAM Application (CI/CD deploy) | campus-internship-ci-deploy |
| Object Storage bucket | campus-internship-files-prod |
| Container Registry (namespace) | campus-internship — images taguées api:\<sha\> / web:\<sha\> dedans |
| Containers Namespace (Serverless Containers, distinct du Registry) | campus-internship-prod |
| Serverless Container API | campus-internship-api-prod |
| Serverless Container web | campus-internship-web-prod |
| GitHub Environment | production (déjà la convention GitHub standard, rien à inventer) |
