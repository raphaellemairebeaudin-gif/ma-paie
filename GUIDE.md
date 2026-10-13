# Mettre « Budget App » en ligne (Supabase + GitHub Pages)

Cette version contient la connexion, la création de compte, la récupération de mot de passe, un profil et tous les comptes enregistrés dans Supabase. Un nouvel utilisateur commence avec un seul compte Débit. Le bouton « + » permet d’ajouter Débit, Crédit, Placement ou Autre. Plaid peut aussi connecter des institutions financières canadiennes et synchroniser les soldes des comptes chèques, épargne et crédit. Pour offrir ces types de comptes, la configuration Plaid demande l’accès au produit Transactions; Budget App ne récupère ni n’enregistre les transactions, mais Plaid peut y accéder et le produit peut être facturé en production. Les connexions bancaires peuvent être actualisées ou déconnectées depuis l’application. Depuis le crayon sur une carte, les comptes manuels peuvent être modifiés ou supprimés; les soldes bancaires synchronisés par Plaid sont remplacés lors de l’actualisation. Chaque compte possède aussi un historique de transactions saisies manuellement; enregistrer une dépense diminue le solde, et un revenu l’augmente.

L’application ne demande ni ne stocke de numéro de carte, de date d’expiration ou de code de sécurité. Les soldes et le nom sont des informations personnelles : exécute le script SQL ci-dessous pour activer la protection RLS, qui limite chaque utilisateur à son propre profil.

## 1. Supabase : récupérer deux informations

1. Dans ton projet Supabase, va dans **Project Settings**, puis **API** (ou **API Keys**).
2. Copie le **Project URL** (ex. `https://abcdxyz.supabase.co`) et la clé **publique** (appelée `anon` ou `publishable`).
3. Ouvre `config.js` et remplace `https://TON-PROJET.supabase.co` et `TA-CLE-PUBLIQUE` par ces deux valeurs.

IMPORTANT : ne mets jamais la clé secrète (`service_role` ou `secret`) dans ces fichiers.

## 2. Créer les tables privées

1. Dans Supabase, ouvre **SQL Editor** et crée une nouvelle requête.
2. Copie-colle le contenu de `supabase-schema.sql`, puis exécute-le. Si tu avais déjà installé une version précédente, exécute le script à nouveau : il ajoute les transactions, les règles de suppression et de modification des comptes, la table privée des connexions Plaid, ainsi que les fonctions de création initiale et d’enregistrement atomique des transactions, et migre les comptes Débit/Crédit déjà enregistrés.
3. Le script crée `app_profiles`, `app_accounts`, `app_transactions` et `plaid_items`. Il active RLS et limite chaque utilisateur à ses propres données; les jetons Plaid ne sont accessibles qu’au serveur. La fonction `create_initial_profile` crée le profil et son unique compte Débit dans une même transaction. La fonction `create_account_transaction` enregistre chaque transaction et modifie le solde du compte atomiquement.

Sans cette étape, l’application ne peut pas enregistrer les profils.

## 3. Configurer la confirmation par courriel et déployer la suppression

La page Information affiche les informations du profil. Avant toute suppression, l’application envoie un code à six chiffres à l’adresse courriel du compte. Le serveur vérifie ce code, révoque les connexions Plaid, puis supprime l’utilisateur et ses données; la clé `service_role` reste uniquement côté serveur.

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

## 4. Connecter Plaid (banques canadiennes)

L’application appelle Plaid uniquement pour créer la connexion, échanger le jeton et lire les soldes. Le produit Plaid **Transactions** demandé lors de Link peut donner à Plaid accès à l’historique des opérations et entraîner des frais en production; Budget App ne demande, n’importe ni ne conserve ces opérations. En mode **Sandbox**, seules des institutions et données de test sont disponibles. Les institutions canadiennes n’utilisent généralement pas OAuth avec Plaid actuellement; aucun URI de redirection OAuth n’est nécessaire pour cette configuration Canada.

1. Crée un compte développeur sur [Plaid](https://dashboard.plaid.com/signup), crée une application, puis récupère son **Client ID** et son **Sandbox secret** dans le tableau de bord Plaid. Ne les envoie à personne et ne les ajoute jamais à `config.js`.
2. Dans PowerShell, génère une clé de chiffrement aléatoire de 32 octets :
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
   Copie le résultat temporairement pour la commande suivante; ne l’ajoute à aucun fichier du site.
3. Dans le dossier du projet, configure les secrets Supabase (remplace chaque valeur localement; ne partage pas la commande contenant les secrets) :
   `npx -y supabase@latest secrets set PLAID_CLIENT_ID=TON-CLIENT-ID PLAID_SECRET=TON-SANDBOX-SECRET PLAID_TOKEN_ENCRYPTION_KEY=TA-CLE-BASE64 PLAID_ENV=sandbox --project-ref TON-REF-PROJET`
   Garde la clé de chiffrement : perdre cette clé empêchera de lire les jetons Plaid déjà enregistrés.
4. Exécute de nouveau `supabase-schema.sql` dans le SQL Editor. Le script ajoute les colonnes des comptes synchronisés et une table inaccessible au navigateur pour les connexions Plaid.
5. Déploie la fonction Edge :
   `npx -y supabase@latest functions deploy plaid --project-ref TON-REF-PROJET`
6. Déploie les fichiers du site selon l’étape 5. L’application affichera **Connecter une banque avec Plaid**. Pour utiliser de vrais comptes canadiens, demande l’accès Production à Plaid, puis configure le secret `PLAID_SECRET` avec le secret Production et `PLAID_ENV=production`. L’accès Production et les institutions disponibles dépendent de l’approbation Plaid.

La fonction Edge `plaid` échange le jeton public de courte durée côté serveur et chiffre le jeton d’accès avec `PLAID_TOKEN_ENCRYPTION_KEY`. Aucun jeton bancaire secret n’est envoyé au navigateur. Seuls les comptes en CAD sont affichés. Pour retirer une institution, ouvre un de ses comptes, utilise le crayon puis **Déconnecter cette banque**.

## 5. GitHub : mettre les fichiers en ligne

1. Sur github.com, ouvre ton dépôt existant (ou crées-en un : **New repository**, **Public**).
2. Si le dépôt contient l'ancienne version, supprime les anciens fichiers (surtout `index.html`), ou remplace-les.
3. **Add file > Upload files** : glisse tous les fichiers du site à la racine, ainsi que `supabase/functions/delete-account/index.ts` en gardant ses sous-dossiers :
   `index.html`, `config.js`, `supabase-schema.sql`, `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `supabase/functions/delete-account/index.ts`, `supabase/functions/plaid/index.ts`
4. Clique **Commit changes**.
5. **Settings > Pages** : **Deploy from a branch**, branche **main**, dossier **/ (root)**, **Save**.
6. Après 1 à 2 minutes, l'adresse du site s'affiche : `https://TON-NOM.github.io/NOM-DU-DEPOT/`

## 6. Supabase : dire où est ton site

1. **Authentication > URL Configuration**.
2. **Site URL** : colle l'adresse de ton site GitHub (avec le `/` à la fin).
3. **Redirect URLs** : ajoute la même adresse.
   Ça sert aux liens reçus par courriel (confirmation, mot de passe oublié).

## 7. Essayer

1. Ouvre l'adresse dans Safari sur ton iPhone.
2. Crée un compte et confirme ton courriel si Supabase le demande.
3. Au premier accès, remplis le formulaire de profil et le solde initial Débit. Les anciens comptes Débit/Crédit sont migrés par le script SQL; les nouveaux profils commencent avec Débit seulement.
4. Pour l'avoir comme une app : **Partager**, puis **Sur l'écran d'accueil**.

Pour empêcher de nouvelles inscriptions, désactive **Allow new users to sign up** dans Supabase (**Authentication > Sign In / Providers**, section Email). Cela empêchera aussi les nouveaux utilisateurs de créer un profil.

## Dépannage

- **« Configuration manquante »** : `config.js` n'a pas été modifié, ou les fichiers ne sont pas à la racine du dépôt.
- **« Profil inaccessible »** : exécute `supabase-schema.sql` dans le SQL Editor de ton projet Supabase et vérifie que la connexion est active. Après une mise à jour, recharge aussi l’app pour récupérer le nouveau script.
- **Les transactions ne chargent pas ou ne s’enregistrent pas** : exécute de nouveau la version actuelle de `supabase-schema.sql` dans le SQL Editor Supabase; elle crée la table et la fonction nécessaires à l’historique.
- **La modification d’un compte est refusée** : exécute de nouveau la version actuelle de `supabase-schema.sql` dans le SQL Editor Supabase; elle ajoute les permissions RLS nécessaires pour modifier leur nom et leur montant.
- **« Error sending magic link email » ou « Supabase n’a pas pu envoyer le code »** : vérifie **Authentication > Emails > SMTP Settings**. Le champ **Host** doit contenir le serveur SMTP, pas l’adresse du site GitHub Pages. Pour Gmail, utilise `smtp.gmail.com`, le port `465`, l’adresse Gmail complète comme **Username**, et un mot de passe d’application Google comme **Password** (la validation en deux étapes doit être activée). Le **Sender email address** doit être cette même adresse Gmail. Garde le mot de passe uniquement dans Supabase; ne le mets pas dans `config.js`. Enregistre les changements puis réessaie après quelques minutes. Si tu utilises un autre fournisseur, demande-lui son nom d’hôte et ses identifiants SMTP.
- **Plaid ne démarre pas ou les soldes ne se chargent pas** : vérifie les secrets `PLAID_CLIENT_ID`, `PLAID_SECRET` et `PLAID_TOKEN_ENCRYPTION_KEY` dans Supabase. La valeur du secret `PLAID_ENV` doit être uniquement `sandbox`, `development` ou `production` — sans guillemets ni autre commande. Pour réinitialiser le mode test depuis PowerShell, lance `npx -y supabase@latest secrets set PLAID_ENV=sandbox --project-ref TON-REF-PROJET`, puis redéploie avec `npx -y supabase@latest functions deploy plaid --project-ref TON-REF-PROJET`. Le Sandbox ne se connecte pas aux comptes bancaires réels.
- **Le code de suppression n’arrive pas** : vérifie le modèle **Authentication > Email Templates > Magic Link**, notamment la présence de `{{ .Token }}`, puis les courriels indésirables et les limites d’envoi. Si le bouton reste sur « Envoi en cours... », la fonction Edge ne répond pas : l’application arrête maintenant l’attente après 30 secondes. Consulte les journaux de `delete-account` sous **Edge Functions > delete-account > Logs** et les journaux Auth dans **Logs Explorer** pour repérer l’échec d’envoi ou une requête bloquée. Vérifie aussi l’activité ou les rejets dans le tableau de bord de ton fournisseur SMTP. Après un délai d’attente, le courriel peut tout de même arriver; attends avant de demander un nouvel envoi.
- **L’application affiche une erreur lors de l’envoi du code** : lis le détail maintenant affiché dans le dialogue. Il indique l’erreur renvoyée par Supabase Auth (par exemple une limite d’envoi ou un problème avec le modèle courriel).
- **La suppression permanente du compte échoue** : déploie à nouveau `supabase/functions/delete-account/index.ts` et vérifie que le secret `SB_SERVICE_ROLE_KEY` ou `SUPABASE_SERVICE_ROLE_KEY` est défini dans les secrets des fonctions Edge.
- **Ancienne version qui s'affiche** : ferme l'app complètement et rouvre-la, ou recharge la page dans Safari.
- **Le lien du courriel ouvre une mauvaise page** : revois l'étape 4.

## Changer le nom du site

- Nom affiché dans l'app (première page, connexion, onglet du navigateur) : `APP_NAME` dans `config.js`.
- Nom sous l'icône sur l'écran d'accueil : `name` et `short_name` dans `manifest.webmanifest`, et la ligne `apple-mobile-web-app-title` dans `index.html`.
  Si l'app est déjà sur ton écran d'accueil, retire-la et ajoute-la de nouveau pour que le nouveau nom apparaisse.
