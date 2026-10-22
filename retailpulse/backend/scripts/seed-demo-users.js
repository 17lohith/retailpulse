// Creates login accounts for the SIMULATED demo shops. Demo passwords are for local demos only.
import bcrypt from 'bcryptjs';
import { connectDb, disconnectDb } from '../src/db.js';
import { User, Tenant } from '../src/models/index.js';

await connectDb();
const PASSWORD = process.env.DEMO_PASSWORD || 'Demo@1234';
for (const t of await Tenant.find({ simulated: true }).lean()) {
  for (const [role, who] of [['owner', 'owner'], ['manager', 'manager'], ['staff', 'staff']]) {
    const email = `${who}@${t._id}.retailpulse.test`;
    if (!(await User.exists({ email }))) { await User.create({ tenantId: t._id, email, name: `${t.name} ${role}`, role, passwordHash: await bcrypt.hash(PASSWORD, 10) }); console.log('created', email); }
  }
}
await disconnectDb();
