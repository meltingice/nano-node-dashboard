import _ from "lodash";
import { Nano } from "nanode";
import redis from "redis";
import config from "../../server-config.json";
import clientConfig from "../client-config.json";
import Currency from "../lib/Currency";

const redisClient = redis.createClient(config.redis);
redisClient.on("error", err => {
  console.error("Redis unavailable");
});
const nano = new Nano({ url: config.nodeHost });

async function calculateAccountList() {
  console.log("Starting rich list update");

  const frontierCount = (await nano.rpc("frontier_count")).count;
  const data = (await nano.rpc("frontiers", {
    account: `${
      clientConfig.currency.prefixes[0]
    }_1111111111111111111111111111111111111111111111111111hifc8npp`,
    count: frontierCount
  })).frontiers;

  const accounts = _.keys(data);
  console.log(accounts.length, "accounts");

  const accountChunks = _.chunk(accounts, 5000);
  const accountsWithBalance = [];
  const accountsToRemove = [];
  for (let i = 0; i < accountChunks.length; i++) {
    const resp = await nano.accounts.balances(accountChunks[i]);
    _.forEach(resp.balances, (balances, account) => {
      const balance =
        parseFloat(Currency.fromRaw(balances.balance), 10) +
        parseFloat(Currency.fromRaw(balances.pending), 10);

      if (parseFloat(balance, 10) < 0.000001) {
        accountsToRemove.push(account);
      } else {
        accountsWithBalance.push([balance, account]);
      }
    });

    console.log(
      `Accounts with balance: ${accountsWithBalance.length}`,
      `Empty accounts: ${accountsToRemove.length}`
    );
  }

  const sortedAccounts = accountsWithBalance.sort((a, b) => {
    if (a[0] > b[0]) return -1;
    if (a[0] < b[0]) return 1;
    return 0;
  });

  updateSortedAccounts(_.flatten(sortedAccounts), accountsToRemove);
  if (clientConfig.features.searchSuggestions) {
    updateAllAccounts(sortedAccounts, accountsToRemove);
  }

  setTimeout(calculateAccountList, 900000); // every 15 minutes
}

function updateSortedAccounts(accountsWithBalance, accountsToRemove) {
  const sortedKey = `nano-control-panel/${config.redisNamespace ||
    "default"}/sortedAccounts`;

  accountsWithBalance.unshift(sortedKey);
  accountsToRemove.unshift(sortedKey);
  redisClient.zrem(accountsToRemove, (err, resp) => {
    redisClient.zadd(accountsWithBalance, (err, resp) => {
      console.log("Rich list update complete");
    });
  });
}

function updateAllAccounts(accountsWithBalance, accountsToRemove) {
  const unsortedKey = `nano-control-panel/${config.redisNamespace ||
    "default"}/allAccounts`;

  const data = accountsWithBalance.map(a => a[1]).concat(accountsToRemove);

  redisClient.sadd(unsortedKey, data, (err, resp) => {
    console.log("List of all accounts updated");
  });
}

export default function startAccountUpdates() {
  calculateAccountList();
}
