/* Deploy updated dashboard files to FTP
 * Usage: node scripts/deploy.js
 * Uploads assets/data.js and index.html to /dsg on ftp.bakatron.com
 */

const ftp = require("basic-ftp");
const fs = require("fs");
const path = require("path");

const FTP_HOST = "ftp.bakatron.com";
const FTP_USER = process.env.FTP_USER || "abbas@llamagriffin.com";
const FTP_PASS = process.env.FTP_PASS || "";
const REMOTE_DIR = "/game-os/chicken-brulee";

const LOCAL_FILES = [
  { local: path.resolve(__dirname, "..", "assets", "data.js"), remote: `${REMOTE_DIR}/assets/data.js` },
  { local: path.resolve(__dirname, "..", "index.html"), remote: `${REMOTE_DIR}/index.html` },
  { local: path.resolve(__dirname, "..", "tos.html"), remote: `${REMOTE_DIR}/tos.html` },
  { local: path.resolve(__dirname, "..", "privacy.html"), remote: `${REMOTE_DIR}/privacy.html` },
  { local: path.resolve(__dirname, "..", "assets", "app.js"), remote: `${REMOTE_DIR}/assets/app.js` },
  { local: path.resolve(__dirname, "..", "assets", "styles.css"), remote: `${REMOTE_DIR}/assets/styles.css` },
  { local: path.resolve(__dirname, "..", "assets", "favicon.svg"), remote: `${REMOTE_DIR}/assets/favicon.svg` }
];

async function deploy() {
  if (!FTP_PASS) { console.error("ERROR: FTP_PASS not set"); process.exit(1); }

  console.log("=== FTP Deploy ===");
  const client = new ftp.Client();
  client.ftp.verbose = false;

  // The server uses TLS with a cert mismatch; accept it
  try {
    await client.access({
      host: FTP_HOST,
      user: FTP_USER,
      password: FTP_PASS,
      secure: true,
      secureOptions: { rejectUnauthorized: false }
    });
    console.log(`Connected to ${FTP_HOST}`);

    for (const file of LOCAL_FILES) {
      if (!fs.existsSync(file.local)) {
        console.log(`  SKIP (not found): ${file.local}`);
        continue;
      }
      console.log(`  Uploading: ${path.basename(file.local)} -> ${file.remote}`);
      await client.uploadFrom(file.local, file.remote);
      const size = fs.statSync(file.local).size;
      console.log(`    ${(size / 1024).toFixed(1)} KB uploaded`);
    }

    console.log("Deploy complete.");
  } catch (e) {
    console.error("Deploy failed:", e.message);
    process.exit(1);
  } finally {
    client.close();
  }
}

deploy();
