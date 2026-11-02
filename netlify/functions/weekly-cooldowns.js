const { authenticate, json, methodNotAllowed } = require("../lib/http");
const { lagosWeekBounds } = require("../lib/challenge");

exports.handler = async (event) => {
  const methodResponse = methodNotAllowed(event);
  if (methodResponse) return methodResponse;

  const authentication = await authenticate(event);
  if (authentication.error) return authentication.error;

  try {
    const { db } = authentication.admin;
    const currentWeek = lagosWeekBounds(new Date());
    const weekKeys = [1, 2].map((weeksAgo) => {
      const previousWeek = new Date(currentWeek.weekStart);
      previousWeek.setDate(previousWeek.getDate() - weeksAgo * 7);
      return lagosWeekBounds(previousWeek).weekKey;
    });
    const winners = await Promise.all(
      weekKeys.map((weekKey) => db.collection("weeklyWinners").doc(weekKey).get()),
    );
    return json(200, {
      data: {
        userIds: winners
          .filter((winner) => winner.exists)
          .map((winner) => winner.data().firstPlaceUid)
          .filter((uid) => typeof uid === "string" && uid),
      },
    });
  } catch (error) {
    console.error("Weekly cooldown request failed:", error);
    return json(500, { message: "Leaderboard cooldowns could not be loaded. Please try again." });
  }
};
