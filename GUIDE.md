# Mettre « Budget App » en ligne (Supabase + GitHub Pages)

Cette version contient la connexion, la création de compte, la récupération de mot de passe, un profil et tous les comptes enregistrés dans Supabase. Un nouvel utilisateur commence avec un seul compte Débit. Le bouton « + » permet d’ajouter Débit, Crédit, Placement ou Autre. Les comptes sont gérés manuellement depuis l’application. Chaque compte possède aussi un historique de transactions saisies manuellement; enregistrer une dépense diminue le solde, et un revenu l’augmente.

L’application ne demande ni ne stocke de numéro de carte, de date d’expiration ou de code de sécurité. Les soldes et le nom sont des informations personnelles : exécute le script SQL ci-dessous pour activer la protection RLS, qui limite chaque utilisateur à son propre profil.

### Si tu as déjà connecté une banque avec Plaid

Avant de remplacer l’ancienne version du site, ouvre-la et déconnecte chaque banque avec le crayon d’un compte bancaire. Cela révoque les connexions auprès de Plaid. Ensuite, déploie la nouvelle version de `supabase/functions/delete-account/index.ts` et supprime la fonction Edge `plaid` si tu n’en as plus besoin :

```powershell
npx -y supabase@latest functions deploy delete-account --project-ref TON-REF-PROJET
npx -y supabase@latest functions delete plaid --project-ref TON-REF-PROJET
```

Les anciens secrets `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_TOKEN_ENCRYPTION_KEY` et `PLAID_ENV` ne sont pas supprimés automatiquement. Après avoir déconnecté les banques, tu peux les retirer avec :

```powershell
npx -y supabase@latest secrets unset PLAID_CLIENT_ID PLAID_SECRET PLAID_TOKEN_ENCRYPTION_KEY PLAID_ENV --project-ref TON-REF-PROJET
```

Les éventuelles tables et colonnes Plaid déjà créées dans Supabase restent en place et ne gênent pas l’application. Ne supprime pas de données ou d’objets SQL si tu n’es pas certain qu’aucune connexion bancaire n’y est encore enregistrée.

## 1. Supabase : récupérer deux informations

1. Dans ton projet Supabase, va dans **Project Settings**, puis **API** (ou **API Keys**).
2. Copie le **Project URL** (ex. `https://abcdxyz.supabase.co`) et la clé **publique** (appelée `anon` ou `publishable`).
3. Ouvre `config.js` et remplace `https://TON-PROJET.supabase.co` et `TA-CLE-PUBLIQUE` par ces deux valeurs.

IMPORTANT : ne mets jamais la clé secrète (`service_role` ou `secret`) dans ces fichiers.

## 2. Créer les tables privées

1. Dans Supabase, ouvre **SQL Editor** et crée une nouvelle requête.
2. Ouvre le fichier `supabase/schema.sql`, copie-colle son contenu, puis exécute-le. Si tu avais déjà installé une version précédente, exécute le script à nouveau : il ajoute les transactions, les règles de suppression et de modification des comptes, ainsi que les fonctions de création initiale et d’enregistrement atomique des transactions, et migre les comptes Débit/Crédit déjà enregistrés.
3. Le script crée `app_profiles`, `app_accounts` et `app_transactions`. Il active RLS et limite chaque utilisateur à ses propres données. La fonction `create_initial_profile` crée le profil et son unique compte Débit dans une même transaction. La fonction `create_account_transaction` enregistre chaque transaction et modifie le solde du compte atomiquement.

Sans cette étape, l’application ne peut pas enregistrer les profils.

## 3. Configurer la confirmation par courriel et déployer la suppression

La page Information affiche les informations du profil. Avant toute suppression, l’application envoie un code à six chiffres à l’adresse courriel du compte. Le serveur vérifie ce code, puis supprime l’utilisateur et ses données; la clé `service_role` reste uniquement côté serveur.

1. Dans Supabase, ouvre **Authentication > Email Templates > Magic Link**. Ce modèle est utilisé par Supabase pour envoyer le code demandé par l’application. Tu peux laisser le sujet `Magic Link` tel quel; modifie seulement le contenu du courriel pour afficher le code, par exemple :
   - **Body** :
     ```html
     <h2>Confirmation de suppression du compte</h2>
     <p>Entre ce code dans l’application pour confirmer la suppression définitive de ton compte :</p>
     <p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
     <p>Si tu n’as pas demandé la suppression de ton compte, ignore ce courriel.</p>
     ```
   Supprime du modèle tout bouton ou lien utilisant `{{ .ConfirmationURL }}` ou `{{ .TokenHash }}` : ils ouvrent un flux de connexion au lieu d’afficher uniquement le code. Enregistre le modèle.
2. Installe et connecte la [Supabase CLI](https://supabase.com/docs/guides/cli), puis lie-la à ton projet si nécessaire.
3. Dans ce dossier du projet, définis la clé secrète du projet comme secret de fonction. Utilise le nom `SB_SERVICE_ROLE_KEY` si Supabase refuse le préfixe `SUPABASE_` :
   `npx -y supabase@latest secrets set SB_SERVICE_ROLE_KEY=TA-CLE-SERVICE-ROLE --project-ref TON-REF-PROJET`
4. Déploie la fonction :
   `npx -y supabase@latest functions deploy delete-account --project-ref TON-REF-PROJET`
5. Dans Supabase, vérifie que les fonctions Edge sont activées pour le projet.

La clé `service_role` se trouve dans **Project Settings > API**. Ne la copie jamais dans `config.js`, dans le navigateur ou dans Git. La fonction lit `SUPABASE_SERVICE_ROLE_KEY` ou, si tu l’as enregistré sous ce nom, `SB_SERVICE_ROLE_KEY`. Elle utilise la session de la personne connectée, envoie le code à l’adresse courriel associée à cette session et ne supprime le compte qu’après validation du code.

## 4. GitHub : mettre les fichiers en ligne

1. Sur github.com, ouvre ton dépôt existant (ou crées-en un : **New repository**, **Public**).
2. Si le dépôt contient l'ancienne version, supprime les anciens fichiers (surtout `index.html`), ou remplace-les.
3. **Add file > Upload files** : glisse les fichiers du site et les dossiers suivants en conservant cette structure :
   `index.html`, `config.js`, `manifest.webmanifest`, `sw.js`, `assets/`, `supabase/schema.sql`, `supabase/functions/delete-account/index.ts`
4. Clique **Commit changes**.
5. **Settings > Pages** : **Deploy from a branch**, branche **main**, dossier **/ (root)**, **Save**.
6. Après 1 à 2 minutes, l'adresse du site s'affiche : `https://TON-NOM.github.io/NOM-DU-DEPOT/`

## 5. Supabase : dire où est ton site

1. **Authentication > URL Configuration**.
2. **Site URL** : colle l'adresse de ton site GitHub (avec le `/` à la fin).
3. **Redirect URLs** : ajoute la même adresse.
   Ça sert aux liens reçus par courriel (confirmation, mot de passe oublié).

## 6. Essayer

1. Ouvre l'adresse dans Safari sur ton iPhone.
2. Crée un compte et confirme ton courriel si Supabase le demande.
3. Au premier accès, remplis le formulaire de profil et le solde initial Débit. Les anciens comptes Débit/Crédit sont migrés par le script SQL; les nouveaux profils commencent avec Débit seulement.
4. Pour l'avoir comme une app : **Partager**, puis **Sur l'écran d'accueil**.

Pour empêcher de nouvelles inscriptions, désactive **Allow new users to sign up** dans Supabase (**Authentication > Sign In / Providers**, section Email). Cela empêchera aussi les nouveaux utilisateurs de créer un profil.

## Dépannage

- **« Configuration manquante »** : `config.js` n'a pas été modifié, ou les fichiers ne sont pas à la racine du dépôt.
- **« Profil inaccessible »** : exécute `supabase/schema.sql` dans le SQL Editor de ton projet Supabase et vérifie que la connexion est active. Après une mise à jour, recharge aussi l’app pour récupérer la nouvelle version.
- **Les transactions ne chargent pas ou ne s’enregistrent pas** : exécute de nouveau la version actuelle de `supabase/schema.sql` dans le SQL Editor Supabase; elle crée la table et la fonction nécessaires à l’historique.
- **La modification d’un compte est refusée** : exécute de nouveau la version actuelle de `supabase/schema.sql` dans le SQL Editor Supabase; elle ajoute les permissions RLS nécessaires pour modifier leur nom et leur montant.
- **« Error sending magic link email » ou « Supabase n’a pas pu envoyer le code »** : vérifie **Authentication > Emails > SMTP Settings**. Le champ **Host** doit contenir le serveur SMTP, pas l’adresse du site GitHub Pages. Pour Gmail, utilise `smtp.gmail.com`, le port `465`, l’adresse Gmail complète comme **Username**, et un mot de passe d’application Google comme **Password** (la validation en deux étapes doit être activée). Le **Sender email address** doit être cette même adresse Gmail. Garde le mot de passe uniquement dans Supabase; ne le mets pas dans `config.js`. Enregistre les changements puis réessaie après quelques minutes. Si tu utilises un autre fournisseur, demande-lui son nom d’hôte et ses identifiants SMTP.
- **Le code de suppression n’arrive pas** : vérifie le modèle **Authentication > Email Templates > Magic Link**, notamment la présence de `{{ .Token }}`, puis les courriels indésirables et les limites d’envoi. Si le bouton reste sur « Envoi en cours... », la fonction Edge ne répond pas : l’application arrête maintenant l’attente après 30 secondes. Consulte les journaux de `delete-account` sous **Edge Functions > delete-account > Logs** et les journaux Auth dans **Logs Explorer** pour repérer l’échec d’envoi ou une requête bloquée. Vérifie aussi l’activité ou les rejets dans le tableau de bord de ton fournisseur SMTP. Après un délai d’attente, le courriel peut tout de même arriver; attends avant de demander un nouvel envoi.
- **L’application affiche une erreur lors de l’envoi du code** : lis le détail maintenant affiché dans le dialogue. Il indique l’erreur renvoyée par Supabase Auth (par exemple une limite d’envoi ou un problème avec le modèle courriel).
- **La suppression permanente du compte échoue** : déploie à nouveau `supabase/functions/delete-account/index.ts` et vérifie que le secret `SB_SERVICE_ROLE_KEY` ou `SUPABASE_SERVICE_ROLE_KEY` est défini dans les secrets des fonctions Edge.
- **Ancienne version qui s'affiche** : ferme l'app complètement et rouvre-la, ou recharge la page dans Safari.
- **Le lien du courriel ouvre une mauvaise page** : revois l'étape 5.

## Changer le nom du site

- Nom affiché dans l'app (première page, connexion, onglet du navigateur) : `APP_NAME` dans `config.js`.
- Nom sous l'icône sur l'écran d'accueil : `name` et `short_name` dans `manifest.webmanifest`, et la ligne `apple-mobile-web-app-title` dans `index.html`.
  Si l'app est déjà sur ton écran d'accueil, retire-la et ajoute-la de nouveau pour que le nouveau nom apparaisse.
