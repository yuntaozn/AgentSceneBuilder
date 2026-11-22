// Keep the builder's first exception and attach all independent parameter errors for scene check.
export function readComponentParameters(parse) {
  const errors = [];
  function invalid(field, error) { errors.push({ error, field: error.field ?? field }); }
  function read(field, evaluate) {
    try { return evaluate(); }
    catch (error) { invalid(field, error); }
  }
  const value = parse(read, invalid);
  if (errors.length) {
    const parameterIssues = errors.map(({ field, error }) => ({ field, message: error.message }));
    throw Object.assign(errors[0].error, { parameterIssues });
  }
  return value;
}
