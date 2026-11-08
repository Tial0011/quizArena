const { authenticate, json, methodNotAllowed } = require("../lib/http");
const { getPreviousWeekKey } = require("../lib/weeklyWinners");

exports.handler = async (event) => {
  const methodResponse = methodNotAllowed(event);
  if (methodResponse) return methodResponse;

  const authentication = await authenticate(event);
  if (authentication.error) return authentication.error;

  if (new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Lagos",
    weekday: "short",
  }).format(new Date()) !== "Mon") {
    return json(403, { message: "Last week's winners are only available on Mondays." });
  }

  try {
    const weekKey = getPreviousWeekKey();
    const winnerSnapshot = await authentication.admin.db
      .collection("weeklyWinners")
      .doc(weekKey)
      .get();
    if (!winnerSnapshot.exists) return json(200, { data: null });

    const week = winnerSnapshot.data();
    const winners = (week.winners || []).slice(0, 3);
    const userRefs = winners
      .map((winner) => winner.uid)
      .filter((uid) => typeof uid === "string" && uid)
      .map((uid) => authentication.admin.db.collection("users").doc(uid));
    const userDocs = userRefs.length
      ? await authentication.admin.db.getAll(...userRefs)
      : [];
    const usernames = new Map(userDocs.map((userDoc) => [
      userDoc.id,
      userDoc.exists && typeof userDoc.data().username === "string"
        ? userDoc.data().username.trim()
        : "",
    ]));

    return json(200, {
      data: {
        weekKey: week.weekKey,
        weekStart: week.weekStart?.toMillis?.() || null,
        weekEnd: week.weekEnd?.toMillis?.() || null,
        winners: winners.map((winner) => ({
          place: winner.place,
          username: usernames.get(winner.uid) || "Student",
          prizeNaira: winner.prizeNaira || 0,
        })),
      },
    });
  } catch (error) {
    console.error("Previous weekly winners request failed:", error);
    return json(500, { message: "Last week's winners could not be loaded. Please try again." });
  }
};
