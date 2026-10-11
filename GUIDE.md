# Mettre « Mon app » en ligne (Supabase + GitHub Pages)

Cette version contient seulement : connexion, création de compte, mot de passe oublié, et une page principale blanche.
Aucune table à créer dans Supabase : la connexion fonctionne avec ton projet tel quel.

## 1. Supabase : récupérer deux informations

1. Dans ton projet Supabase, va dans **Project Settings**, puis **API** (ou **API Keys**).
2. Copie le **Project URL** (ex. `https://abcdxyz.supabase.co`) et la clé **publique** (appelée `anon` ou `publishable`).
3. Ouvre `config.js` et remplace `https://TON-PROJET.supabase.co` et `TA-CLE-PUBLIQUE` par ces deux valeurs.

IMPORTANT : ne mets jamais la clé secrète (`service_role` ou `secret`) dans ces fichiers.

## 2. GitHub : mettre les fichiers en ligne

1. Sur github.com, ouvre ton dépôt existant (ou crées-en un : **New repository**, **Public**).
2. Si le dépôt contient l'ancienne version, supprime les anciens fichiers (surtout `index.html`), ou remplace-les.
3. **Add file > Upload files** : glisse tous les fichiers de ce dossier à la racine :
   `index.html`, `config.js`, `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`
4. Clique **Commit changes**.
5. **Settings > Pages** : **Deploy from a branch**, branche **main**, dossier **/ (root)**, **Save**.
6. Après 1 à 2 minutes, l'adresse du site s'affiche : `https://TON-NOM.github.io/NOM-DU-DEPOT/`

## 3. Supabase : dire où est ton site

1. **Authentication > URL Configuration**.
2. **Site URL** : colle l'adresse de ton site GitHub (avec le `/` à la fin).
3. **Redirect URLs** : ajoute la même adresse.
   Ça sert aux liens reçus par courriel (confirmation, mot de passe oublié).

## 4. Essayer

1. Ouvre l'adresse dans Safari sur ton iPhone.
2. **Créer un compte**, puis connecte-toi : tu arrives sur la page blanche.
3. Pour l'avoir comme une app : **Partager**, puis **Sur l'écran d'accueil**.

## 5. Ensuite : ferme les inscriptions

Une fois ton compte créé, dans Supabase (**Authentication > Sign In / Providers**, section Email),
désactive **Allow new users to sign up** pour que personne d'autre ne puisse créer de compte.

## Dépannage

- **« Configuration manquante »** : `config.js` n'a pas été modifié, ou les fichiers ne sont pas à la racine du dépôt.
- **Ancienne version qui s'affiche** : ferme l'app complètement et rouvre-la, ou recharge la page dans Safari.
- **Le lien du courriel ouvre une mauvaise page** : revois l'étape 3.
