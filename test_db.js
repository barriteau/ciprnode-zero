import { getDbConnection } from './src/db/client.js'; const db = await getDbConnection(); const stmt = db.prepare('SELECT * FROM ciprdup'); console.log(stmt.all());
