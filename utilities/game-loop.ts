import Yargs from "yargs/yargs";
import formatMoney from "./format-money";
import { BettingRound } from "@chevtek/poker-engine";
import { Table, ActionEmoji } from "../models";
import config from "../config";

const { COMMAND_PREFIX } = config;

export default async function (table: Table) {

  await table.render();

  // If there is an existing prompt for this channel then create a new prompt and resolve the old one with it.
  if (table.prompt) return table.createPrompt(table.prompt);

  (async function () {

    let lastAction;

    while (table.currentRound) {

      const player = table.currentActor!;

      try {

        const legalActions = player.legalActions();

        if (legalActions.includes("bet") || legalActions.includes("raise")) {
          legalActions.push("all-in");
        }

        const actionsTxt = legalActions.map((action, index) => {
          if (["bet", "raise"].includes(action)) {
            action += " <number>";
          }
          if (index === legalActions.length - 1){ 
            return ` or \`${action}\``
          }
          return ` \`${action}\``;
        }).join();

        // Ask user what they would like to do.
        const currentBetTxt = table.currentBet && table.currentBet > 0 ? `The current bet is \`${formatMoney(table.currentBet)}\`.` : "There is no bet yet.";
        const reactions: ActionEmoji[] = [];
        if (legalActions.includes("check") || legalActions.includes("call")) {
          reactions.push(ActionEmoji.CHECK_OR_CALL);
        }
        if (legalActions.includes("bet") || legalActions.includes("raise")) {
          reactions.push(ActionEmoji.BET_OR_RAISE);
        }
        if (legalActions.includes("fold")) {
          reactions.push(ActionEmoji.FOLD);
        }

        const prompt = await table.createPrompt({
          userId: player.id,
          text: `<@${player.id}>,${lastAction ? ` ${lastAction}` : ""} ${currentBetTxt} What would you like to do?\n You can type: ${actionsTxt}. You can also use the emoji reacts below this message.`,
          reactions,
          awaitMessages: {
            filter: response => response && legalActions.includes(response.content.toLowerCase().split(" ")[0]) && response.author.id === player.id,
            options: { max: 1 }
          },
          awaitReactions: {
            filter: (reaction, user) => reaction
              && [
                ActionEmoji.CHECK_OR_CALL,
                ActionEmoji.BET_OR_RAISE,
                ActionEmoji.FOLD
              ].includes(reaction.emoji.id)
              && user.id === player.id,
            options: { max: 1 }
          }
        });

        const response = await prompt.promise!;

        if (!response) continue;

        let action;

        switch (response) {

          case ActionEmoji.CHECK_OR_CALL:
            if (legalActions.includes("check")) {
              action = "check";
            } else if (legalActions.includes("call")) {
              action = "call";
            }
            break;

          case ActionEmoji.BET_OR_RAISE:
            const prompt = await table.createPrompt({
              userId: player.id,
              text: `<@${player.id}>, how much would you like to bet? \`<number|"all-in">\``,
              reactions: [ActionEmoji.ALL_IN],
              awaitMessages: {
                filter: response => response && response.content !== "" && ((!isNaN(response.content.replace("$", "")) || response.content.toLowerCase() === "all-in")),
                options: { max: 1 }
              },
              awaitReactions: {
                filter: (reaction, user) => reaction && reaction.emoji.id === ActionEmoji.ALL_IN
                  && user.id === player.id,
                options: { max: 1 }
              }
            });
            const betResponse = await prompt.promise!;
            switch (betResponse) {
              case ActionEmoji.ALL_IN:
                action = legalActions.includes("raise") ? `raise ${player.stackSize}` : `bet ${player.stackSize}`;
                break;
              default:
                const amount = betResponse?.toLowerCase().replace("$", "");
                if (!amount) continue;
                if (amount === "all-in") {
                  action = legalActions.includes("raise") ? `raise ${player.stackSize}` : `bet ${player.stackSize}`;
                } else {
                  action = legalActions.includes("raise") ? `raise ${amount}` : `bet ${amount}`;
                }
                break;
            }
            break;

          case ActionEmoji.FOLD:
            action = "fold";
            break;

          default:
            action = response?.toLowerCase();
            if (action === "all-in") {
              action = `raise ${player.stackSize}`;
            }
            break;

        }

        const roundBeforeAction = table.currentRound;
        const currentBetBeforeAction = table.currentBet;
        const playerName = table.channel.guild!.members.cache.get(player.id)!.displayName;

        await new Promise((resolve, reject) => Yargs()
          .exitProcess(false)
          .command(
            "bet <amount>",
            "Open the bet.",
            yargs => yargs.number("amount").required("amount"),
            async ({ amount }) => {
              player.betAction(Math.floor(amount));
              lastAction = `${playerName} bet \`$${Math.floor(amount)}\`.`;
              await table.playRandomSound("./sounds/bet-raise");
            }
          )
          .command(
            "call",
            "Call the current bet.",
            () => {},
            async () => {
              player.callAction();
              lastAction = `${playerName} called.`;
              await table.playRandomSound("./sounds/call");
            }
          )
          .command(
            "check",
            "Pass action forward if there is no bet.",
            () => {},
            async () => {
              player.checkAction();
              lastAction = `${playerName} checked.`;
              await table.playRandomSound("./sounds/check");
            }
          )
          .command(
            "raise <amount>",
            "Raise the current bet.",
            yargs => yargs.number("amount").required("amount"),
            async ({ amount }) => {
              player.raiseAction(Math.floor(amount));
              lastAction = `${playerName} raised to \`$${Math.floor(amount)}\`.`;
              await table.playRandomSound("./sounds/bet-raise");
            }
          )
          .command(
            "fold",
            "Leave the hand.",
            () => {},
            async () => {
              player.foldAction();
              lastAction = `${playerName} folded.`;
              await table.playRandomSound("./sounds/fold");
            }
          )
          .onFinishCommand(resolve)
          .fail((msg, err) => reject(msg || err))
          .parse(action!)
        );

        const roundAfterAction = table.currentRound;
        if (roundAfterAction !== roundBeforeAction) {
          lastAction = `Betting for the ${roundAfterAction} has begun.`;
        }

        // Play post-round sound effects.
        if (table.voiceConnection && roundAfterAction !== roundBeforeAction) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          (async () => {
            if (currentBetBeforeAction) {
              await table.playRandomSound("./sounds/gather-chips");
            }
            await new Promise((resolve) => setTimeout(resolve, 500));
            switch (roundAfterAction) {
              case BettingRound.FLOP:
                for (let index = 0; index < 3; index++) {
                  await table.playRandomSound("./sounds/place-card");
                }
                break;
              case BettingRound.TURN:
                await table.playRandomSound("./sounds/place-card");
                break;
              case BettingRound.RIVER:
                await table.playRandomSound("./sounds/place-card");
                break;
              default:
                await table.playRandomSound("./sounds/winner");
                break;
            }
          })();
        }

        // Re-render table and delete any active prompt.
        delete table.prompt;
        await table.render();
        if (table.winners) {
          table.cleanUp();
          // Manually move dealer after a win so we can tell who the next dealer is and allow them to issue the deal command.
          table.moveDealer(table.dealerPosition! + 1)
          table.beginAutoDestructSequence();
          await new Promise<void>((resolve, reject) => setTimeout(async () => {
            try {
              await table.render()
              const dealerMember = table.channel.guild.members.cache.get(table.dealer!.id)!;
              const channel = dealerMember.user.dmChannel || await dealerMember.user.createDM();
              channel.send(`<@${dealerMember.id}>, You are the next dealer. You can run \`${COMMAND_PREFIX}deal\` when you are ready to begin the next hand.`);
              await Promise.all(table.players.filter(player => player !== null).map(async player => {
                const member = table.channel.guild.members.cache.get(player!.id)!;
                const channel = member.user.dmChannel || await member.user.createDM();
                await channel.send(`${dealerMember.displayName} is now the dealer.`);
              }));
              resolve();
            } catch (err) {
              reject(err);
            }
          }, 5000));
        }
        await table.saveToDb();

      } catch (err) {
        await table.render();
        const user = table.channel.guild.members.cache.get(player.id)!.user;
        const channel = user.dmChannel || await user.createDM();
        channel.send(`<@${player.id}>, ${err.message}`);
      }
    }
  })();
}