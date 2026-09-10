# Deploying to GitHub Pages

1. Create a new GitHub repository (e.g. `group-scoreboard`). It can be public or private —
   GitHub Pages works either way (private repos need GitHub Pages enabled in Settings).

2. Upload everything in this folder to that repository (drag-and-drop on github.com works,
   or use `git push` if you're comfortable with git).

3. Open `vite.config.js` and set `base` to match your repo name, e.g.:
   ```js
   base: "/group-scoreboard/",
   ```
   (Skip this step if you're using a custom domain instead of the default github.io URL.)

4. On your own computer (or anywhere with Node.js installed), run:
   ```
   npm install
   npm run build
   ```
   This creates a `dist` folder with the finished website.

5. Push the contents of `dist` to a branch called `gh-pages` in the same repo — the easiest
   way is to install one small helper tool and let it do this for you:
   ```
   npm install --save-dev gh-pages
   npx gh-pages -d dist
   ```

6. In your GitHub repo, go to Settings → Pages, and set the source to the `gh-pages` branch.
   GitHub will give you a live URL like `https://<your-username>.github.io/group-scoreboard/`.

That URL is now permanent, independent of Claude, and works for as long as GitHub Pages exists
(GitHub Pages is free for public repos, and free with limits for private ones on most plans).

## Firestore security note

Your database is currently in "test mode," meaning anyone with your Firebase config (which is
visible in this app's source code, by design) can read and write to it — there's no login check.
This is fine to get started, but before wide classroom rollout, go to Firebase Console →
Firestore → Rules and consider tightening this, e.g. restricting writes to only the known
class IDs (F3, F4, F6) rather than any arbitrary document.
