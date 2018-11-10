import os from "os";
import raiNodeInfo from "../../helpers/raiNodeInfo";
import dbSize from "../../helpers/dbSize";
import redisFetch from "../../helpers/redisFetch";

export default function(app, nano) {
  app.get("/version", async (req, res) => {
    try {
      const version = await redisFetch("version", 3600, async () => {
        return await nano.rpc("version");
      });

      res.json(version);
    } catch (e) {
      res.status(500).send({ error: e.message });
    }
  });

  app.get("/system_info", async (req, res) => {
    try {
      const data = await redisFetch("systemInfo", 10, async () => {
        const stats = await raiNodeInfo();
        const decimals = 3;
        return {
          uptime: os.uptime(),
          loadAvg: os.loadavg.toFixed(decimals),
          memory: {
            free: os.freemem(),
            total: os.totalmem()
          },
          dbSize: await dbSize(),
          raiStats: {
            cpu: stats.cpu,
            memory: stats.memory,
            elapsed: stats.elapsed
          }
        };
      });

      res.json(data);
    } catch (e) {
      res.status(500).send({ error: e.message });
    }
  });
}
