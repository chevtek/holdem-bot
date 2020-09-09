import { Message, TextChannel } from "discord.js";
import { gameLoop } from "../utilities";
import { Table, Account } from "../models";
import config from "../config";
import { min } from "moment";

const {
  COMMAND_PREFIX,
  DEFAULT_BANKROLL
} = config;

export const command = ["create", "poker", "holdem"];

export const description = "Create a Hold'em table in this channel.";

export const builder = {
  "min-buy-in": {
    description: "Specify a minimum buy-in amount for the table.",
    default: 1000,
    type: "number"
  },
  "buy-in": {
    description: "Specify the amount to buy-in as the creator of the game. Default is the minimum buy-in.",
    type: "number"
  },
  "big-blind": {
    description: "Specify the amount of the big blind.",
    default: 20
  },
  "small-blind": {
    description: "Specify the amount of the small blind.",
    default: 10
  },
  "sound": {
    description: "If false this will disable sound effects for this table.",
    type: "boolean",
    default: true
  },
  "turn-timer": {
    description: "The number of seconds a player has on their turn before they auto-fold.",
    type: "number",
    default: 45
  },
  "auto-destruct-timer": {
    description: "The number of minutes to wait before a table becomes idle and is automatically destroyed.",
    type: "number",
    default: 15
  },
  "reset": {
    description: "Remove all players and reset the table.",
    type: "boolean"
  },
  "debug": {
    type: "boolean",
    hidden: true
  }
};

export async function handler (argv) {
  const {
    discord,
    minBuyIn,
    buyIn,
    bigBlind,
    smallBlind,
    sound,
    turnTimer,
    autoDestructTimer,
    reset,
    debug
  } = argv;
  const message = discord.message as Message;
  if (message.channel.type === "dm") {
    await message.reply("This command can only be run from a channel on a server.");
    return;
  }
  let table = await Table.findByChannelId(message.channel.id);
  if (table) {
    if (!reset) {
      await message.reply("There is already an active Hold'em game in this channel.");
      await table.render();
      if (table.currentRound) {
        gameLoop(table);
      }
      return;
    }
    try {
      await message.reply("Are you sure? Type `CONFIRM` to reset the table.");
      await message.channel.awaitMessages(
        response => {
          if (response.author.id !== message.author.id) return false;
          return response.content === "CONFIRM";
        },
        { max: 1, time: 20000, errors: ["time"] }
      );
      for (const player of table.players) {
        if (!player) continue;
        const account = await Account.findByPlayerAndGuild(player.id, table!.channel.guild.id);
        if (!account) {
          await message.reply(`Unable to find player ${player.id} in DB. Unable to return stack.`);
          return;
        }
        account.bankroll += player.stackSize;
        await account.saveToDb();
      };
      table.prompt?.resolve?.();
      await table.deleteFromDb();
    } catch (err) {
      await message.reply("No confirmation received. The table was not reset.");
      return;
    }
  }
  const existingTable = await Table.findByPlayerId(message.author.id);
  if (existingTable && (!table || table.channel.id !== existingTable.channel.id)) {
    await message.reply(`You have already joined a table. Use \`${COMMAND_PREFIX}stand\` from your Hold'em Bot PM to leave your active table.`);
    return;
  }
  table = new Table(
    message.author.id,
    message.channel as TextChannel,
    minBuyIn,
    smallBlind,
    bigBlind
  );
  table.sound = sound;
  table.turnTimer = turnTimer;
  table.autoDestructTimer = autoDestructTimer;
  table.debug = debug;
  // Do not auto move dealer. We want to manually move the dealer after a win.
  table.autoMoveDealer = false;
  table.sitDown(message.author.id, buyIn || table.buyIn);
  const account = (await Account.findByPlayerAndGuild(message.author.id, message.guild!.id))
    ?? new Account(
      message.author.id,
      message.guild!.id,
      parseInt(DEFAULT_BANKROLL)
    );
  account.bankroll -= buyIn || minBuyIn;
  await Promise.all([table.saveToDb(), account.saveToDb(), table.render()]);
}