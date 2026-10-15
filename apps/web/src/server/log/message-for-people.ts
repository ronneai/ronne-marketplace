/**
 * Marks an error class whose messages are written for people and may name an item, scope or
 * workspace (the domains' errors): the logs write its name and code, never its message (feature 100,
 * 093). A base class sets it once, as a field: `readonly [MESSAGE_FOR_PEOPLE] = true`.
 */
export const MESSAGE_FOR_PEOPLE: unique symbol = Symbol.for("ronne.log.messageForPeople");
