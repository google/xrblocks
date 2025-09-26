# XR Blocks Docuemntation Site

This website is built using [Docusaurus](https://docusaurus.io/).

## Development

Start the development server for the documentation:
```
## In the arlabs/docs folder:
npm start
```

Then start the development server for the source code:
```
## In the arlabs folder:
http-server --cors
```

## Staging Website Deployment

Login with `uplink-helper login` and then run `update_staging.sh`.

Internally, the script will run `npm build` with the staging environment variables set, then run `zipline upload` to upload to the internal staging site.
