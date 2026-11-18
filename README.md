# Trading-Systems
A tool for traders who build, test, refine, and track algorithmic or discretionary systems.

## BigQuery sync

The HTTP function source is in `task-function/`. Deploy it from the repository root with:

```sh
gcloud functions deploy exportNotes \
  --gen2 \
  --runtime=nodejs20 \
  --region=us-central1 \
  --source=task-function \
  --entry-point=exportNotes \
  --trigger-http \
  --allow-unauthenticated \
  --project=ops-board-506600 \
  --set-env-vars=GOOGLE_CLIENT_ID=743665673546-dei6iesm01lgghu3qeorji0aqeos4083.apps.googleusercontent.com,ALLOWED_ORIGIN=https://systems.morninglightsolutions.com
```

The OAuth web client must authorize `https://systems.morninglightsolutions.com` as a JavaScript origin. The function validates Google ID tokens itself, so the HTTP trigger must be reachable by the browser. Grant its runtime service account BigQuery Data Editor on the `trading_systems` dataset and BigQuery Job User on the project. The table stores each sync as an append-only snapshot; the load endpoint returns the latest snapshot for the signed-in user.
