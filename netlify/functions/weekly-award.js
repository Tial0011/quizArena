const { authenticate, json, methodNotAllowed } = require("../lib/http");
const { getPreviousWeekKey } = require("../lib/weeklyWinners");

exports.handler = async (event) => {
  const methodResponse = methodNotAllowed(event);
  if (methodResponse) return methodResponse;

  const authentication = await authenticate(event);
  if (authentication.error) return authentication.error;

  try {
    const weekKey = getPreviousWeekKey();
    const weekSnapshot = await authentication.admin.db
      .collection("weeklyWinners")
      .doc(weekKey)
      .get();
    if (!weekSnapshot.exists) return json(200, { data: null });

    const week = weekSnapshot.data();
    const winner = (week.winners || []).find(
      (entry) => entry.uid === authentication.user.uid,
    );
    if (!winner) return json(200, { data: null });

    return json(200, {
      data: {
        place: winner.place,
        prizeNaira: winner.prizeNaira || 0,
        weekKey: week.weekKey,
        weekStart: week.weekStart?.toMillis?.() || null,
        weekEnd: week.weekEnd?.toMillis?.() || null,
      },
    });
  } catch (error) {
    console.error("Weekly award status request failed:", error);
    return json(500, { message: "Your weekly award could not be loaded. Please try again." });
  }
};
