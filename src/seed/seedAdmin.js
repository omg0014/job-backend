import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { User } from '../models/User.js';

/**
 * Creates or resets the single HR admin account. There is no public admin
 * signup — this script is the only way an admin comes into existence.
 */
const run = async () => {
  await connectDb();

  const { name, email, password } = env.seedAdmin;
  const passwordHash = await bcrypt.hash(password, env.bcryptRounds);

  const existing = await User.findOne({ email });

  if (existing) {
    existing.name = name;
    existing.passwordHash = passwordHash;
    existing.role = 'admin';
    existing.isActive = true;
    await existing.save();
    console.log(`[seed] admin password reset for ${email}`);
  } else {
    await User.create({ name, email, passwordHash, role: 'admin' });
    console.log(`[seed] admin created: ${email}`);
  }

  console.log(`[seed] sign in with ${email} / ${password}`);
  await disconnectDb();
};

run().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
