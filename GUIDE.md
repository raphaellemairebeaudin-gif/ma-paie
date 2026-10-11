# Mettre « Ma paie » en ligne (Supabase + GitHub Pages)

Compte une trentaine de minutes la première fois.

## 1. Supabase : créer les tables

1. Ouvre ton projet Supabase (ou crées-en un nouveau : bouton **New project**).
2. Dans le menu de gauche, ouvre **SQL Editor** puis **New query**.
3. Ouvre le fichier `supabase-setup.sql`, copie tout son contenu, colle-le dans l'éditeur et clique **Run**.
   Tu dois voir « Success ». Ça crée les tables et les règles de sécurité : chaque personne ne voit que ses propres données.

## 2. Supabase : récupérer les deux informations pour l'app

1. Va dans **Project Settings**, puis **API** (ou **API Keys**).
2. Copie :
   - **Project URL** (ex. `https://abcdxyz.supabase.co`)
   - la clé **publique** (appelée `anon` ou `publishable`).
3. Ouvre `config.js` et remplace `https://TON-PROJET.supabase.co` et `TA-CLE-PUBLIQUE` par ces deux valeurs.

IMPORTANT : ne mets jamais la clé secrète (`service_role` ou `secret`) dans ces fichiers.

## 3. GitHub : mettre les fichiers en ligne

1. Sur github.com, clique **New repository**. Nom suggéré : `ma-paie`. Choisis **Public** (nécessaire pour GitHub Pages gratuit, en général) et crée-le.
2. Clique **uploading an existing file** (ou **Add file > Upload files**) et glisse **tous les fichiers de ce dossier** à la racine du dépôt :
   `index.html`, `config.js`, `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`
   (`supabase-setup.sql` et ce guide peuvent aussi y aller, ils ne contiennent aucun secret).
3. Clique **Commit changes**.
4. Va dans **Settings > Pages**. Sous **Build and deployment**, choisis **Deploy from a branch**, branche **main**, dossier **/ (root)**, puis **Save**.
5. Après 1 à 2 minutes, GitHub affiche l'adresse du site :
   `https://TON-NOM.github.io/ma-paie/`

## 4. Supabase : dire où est ton site

1. Dans Supabase, va dans **Authentication > URL Configuration**.
2. **Site URL** : colle l'adresse de ton site GitHub (avec le `/` à la fin).
3. **Redirect URLs** : ajoute la même adresse.
   Ça sert aux liens reçus par courriel (confirmation du compte, mot de passe oublié).

## 5. Premier démarrage

1. Ouvre l'adresse du site sur ton iPhone, dans **Safari**.
2. Touche **Créer un compte**, entre ton courriel et un mot de passe.
   Si Supabase demande de confirmer le courriel, ouvre le lien reçu, puis connecte-toi.
3. Dans l'app : entre ta paie de base, ajoute tes dépenses fixes (onglet Fixes), puis tes comptes d'épargne (onglet Épargne).
4. Pour l'avoir comme une app : touche le bouton **Partager** de Safari, puis **Sur l'écran d'accueil**.

## 6. Une fois ton compte créé : ferme les inscriptions

Pour que personne d'autre ne crée de compte sur ton site :
**Authentication > Sign In / Providers** (ou **Providers > Email**) : désactive **Allow new users to sign up** (inscriptions).
Tu pourras la réactiver au besoin.

## Dépannage

- **« Configuration manquante »** : `config.js` n'a pas été modifié, ou les fichiers n'ont pas été téléversés à la racine du dépôt.
- **Page blanche ou ancienne version après une mise à jour** : ferme l'app complètement et rouvre-la; au besoin, recharge la page dans Safari.
- **« Impossible de charger tes données »** : le script SQL n'a probablement pas été exécuté (étape 1), ou l'adresse/clé de `config.js` est incorrecte.
- **Le lien du courriel ouvre une mauvaise page** : revois l'étape 4 (Site URL et Redirect URLs).
