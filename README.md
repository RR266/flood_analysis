# flood_analysis

## Web app setup

The map needs a Mapbox public token, which is kept out of git:

```sh
cp web/js/secrets.example.js web/js/secrets.js
```

Then paste your `pk.*` token into `web/js/secrets.js`. That file is listed in `.gitignore`.
In your Mapbox account, restrict the token's allowed URLs to the domains that host this site.
