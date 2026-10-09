import { dropStaleTestDbs } from "./test-db";

// The db project's global setup (112): test databases an interrupted run left behind are dropped
// before a new run starts (only those older than two hours, so runs in progress are left alone).
const setup = async () => {
  await dropStaleTestDbs();
};

export default setup;
