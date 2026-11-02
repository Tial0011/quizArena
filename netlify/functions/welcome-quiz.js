const { authenticate, json, methodNotAllowed } = require("../lib/http");
const WELCOME_QUIZ_ID = "odlJoarhn2atl14EpZq6";

exports.handler = async (event) => {
  const methodResponse = methodNotAllowed(event);
  if (methodResponse) return methodResponse;

  const authentication = await authenticate(event);
  if (authentication.error) return authentication.error;

  try {
    const { db } = authentication.admin;
    const snapshot = await db.collection("questions")
      .where("quizId", "==", WELCOME_QUIZ_ID)
      .get();
    return json(200, {
      data: {
        questions: snapshot.docs.map((questionDoc) => ({
          id: questionDoc.id,
          ...questionDoc.data(),
        })),
      },
    });
  } catch (error) {
    console.error("Welcome quiz request failed:", error);
    return json(500, { message: "The welcome quiz could not be loaded. Please try again." });
  }
};
