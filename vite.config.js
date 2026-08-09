import { defineConfig } from 'vite';

/* ---------------------------------------------------------------------------
   Vite config — one job: let the dev server be told which port to use.

   VITE DOES NOT READ `PORT` ON ITS OWN. It defaults to 5173 and, without
   `strictPort`, quietly increments past anything already listening. That is
   fine on one machine with one developer and wrong the moment something
   outside the project is choosing the port — a harness that assigns one and
   then watches it, for instance, ends up watching a port Vite never bound.
   The failure is confusing rather than loud: the server starts, reports
   success, and nothing is there.

   So the port comes from the environment when it is set, and falls back to
   Vite's own default when it is not. Deliberately NOT `strictPort`: if the
   caller has not expressed an opinion, a busy 5173 should still start rather
   than refuse.
--------------------------------------------------------------------------- */

const port = Number(process.env.PORT) || undefined;

export default defineConfig({
  server: {
    port,
    // Only insist on the port when somebody actually asked for one — an
    // assigned port that silently moves is the whole bug this file fixes.
    strictPort: port != null,
  },
});
