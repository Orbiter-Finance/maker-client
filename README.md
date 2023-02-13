## Orbiter Maker Client
### Install dependencies ⏬

```bash
yarn add
```

### Start developing ⚒️

```bash
yarn run dev:maker
```

## Additional Commands

```bash
npm run dev # starts application with hot reload
npm run build # builds application, distributable files can be found in "dist" folder

# OR

npm run build:win # uses windows as build target
npm run build:mac # uses mac as build target
npm run build:linux # uses linux as build target
```

Optional configuration options can be found in the [Electron Builder CLI docs](https://www.electron.build/cli.html).
## Project Structure

```bash
- scripts/ # all the scripts used to build or serve your application, change as you like.
- src/
  - main/ # Main thread (Electron application source)
  - renderer/ # Renderer thread (VueJS application source)
```

### Inject private key program
#### step 1
```bash
nohup python3 -u ./cmd/app.py > ./cmd/app.log 2>&1
```
#### step 2
```
input your key
```
#### step 3
```
ctrl+z
```
#### step 4
```
bg
```

### Docker deploy
```bash
docker-compose up -d
or
docker-compose up --detach --build
```

### Runtime files
#### tokens
*Currency List*`
#### maker_logs
*Collection log record*`
#### nonce
*Payment collection nonce management*`



## Using static files

If you have any files that you want to copy over to the app directory after installation, you will need to add those files in your `src/main/static` directory.

#### Referencing static files from your main process

```ts
/* Assumes src/main/static/myFile.txt exists */

import {app} from 'electron';
import {join} from 'path';
import {readFileSync} from 'fs';

const path = join(app.getAppPath(), 'static', 'myFile.txt');
const buffer = readFileSync(path);
```
