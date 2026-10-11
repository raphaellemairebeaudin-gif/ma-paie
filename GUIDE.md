# Mettre « Mon app » en ligne (Supabase + GitHub Pages)

Cette version contient la connexion, la création de compte, la récupération de mot de passe et un profil d’utilisateur enregistré dans Supabase. Au premier accès après l’inscription, l’utilisateur saisit son prénom, son nom et les soldes actuels de ses comptes de débit et de crédit.

L’application ne demande ni ne stocke de numéro de carte, de date d’expiration ou de code de sécurité. Les soldes et le nom sont des informations personnelles : exécute le script SQL ci-dessous pour activer la protection RLS, qui limite chaque utilisateur à son propre profil.

## 1. Supabase : récupérer deux informations

1. Dans ton projet Supabase, va dans **Project Settings**, puis **API** (ou **API Keys**).
2. Copie le **Project URL** (ex. `https://abcdxyz.supabase.co`) et la clé **publique** (appelée `anon` ou `publishable`).
3. Ouvre `config.js` et remplace `https://TON-PROJET.supabase.co` et `TA-CLE-PUBLIQUE` par ces deux valeurs.

IMPORTANT : ne mets jamais la clé secrète (`service_role` ou `secret`) dans ces fichiers.

## 2. Créer la table privée des profils

1. Dans Supabase, ouvre **SQL Editor** et crée une nouvelle requête.
2. Copie-colle le contenu de `supabase-schema.sql`, puis exécute-le.
3. Le script crée `app_profiles`, active RLS et autorise chaque utilisateur authentifié à lire et modifier uniquement la ligne dont l’identifiant correspond à son compte.

Sans cette étape, l’application ne peut pas enregistrer les profils.

## 3. GitHub : mettre les fichiers en ligne

1. Sur github.com, ouvre ton dépôt existant (ou crées-en un : **New repository**, **Public**).
2. Si le dépôt contient l'ancienne version, supprime les anciens fichiers (surtout `index.html`), ou remplace-les.
3. **Add file > Upload files** : glisse tous les fichiers de ce dossier à la racine :
   `index.html`, `config.js`, `supabase-schema.sql`, `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`
4. Clique **Commit changes**.
5. **Settings > Pages** : **Deploy from a branch**, branche **main**, dossier **/ (root)**, **Save**.
6. Après 1 à 2 minutes, l'adresse du site s'affiche : `https://TON-NOM.github.io/NOM-DU-DEPOT/`

## 4. Supabase : dire où est ton site

1. **Authentication > URL Configuration**.
2. **Site URL** : colle l'adresse de ton site GitHub (avec le `/` à la fin).
3. **Redirect URLs** : ajoute la même adresse.
   Ça sert aux liens reçus par courriel (confirmation, mot de passe oublié).

## 5. Essayer

1. Ouvre l'adresse dans Safari sur ton iPhone.
2. Crée un compte et confirme ton courriel si Supabase le demande.
3. Au premier accès, remplis le formulaire de profil. Les profils existants vont directement à l’accueil.
4. Pour l'avoir comme une app : **Partager**, puis **Sur l'écran d'accueil**.

Pour empêcher de nouvelles inscriptions, désactive **Allow new users to sign up** dans Supabase (**Authentication > Sign In / Providers**, section Email). Cela empêchera aussi les nouveaux utilisateurs de créer un profil.

## Dépannage

- **« Configuration manquante »** : `config.js` n'a pas été modifié, ou les fichiers ne sont pas à la racine du dépôt.
- **« Profil inaccessible »** : exécute `supabase-schema.sql` dans le SQL Editor de ton projet Supabase et vérifie que la connexion est active.
- **Ancienne version qui s'affiche** : ferme l'app complètement et rouvre-la, ou recharge la page dans Safari.
- **Le lien du courriel ouvre une mauvaise page** : revois l'étape 3.

## Changer le nom du site

- Nom affiché dans l'app (première page, connexion, onglet du navigateur) : `APP_NAME` dans `config.js`.
- Nom sous l'icône sur l'écran d'accueil : `name` et `short_name` dans `manifest.webmanifest`, et la ligne `apple-mobile-web-app-title` dans `index.html`.
  Si l'app est déjà sur ton écran d'accueil, retire-la et ajoute-la de nouveau pour que le nouveau nom apparaisse.
