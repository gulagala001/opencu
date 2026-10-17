export const services = {};

export function installReaServices(value) {
  for (const key of Object.keys(value)) {
    if (services[key]) throw new Error(`REA host service ${key} is already installed`);
    services[key] = value[key];
  }
  return () => { for (const key of Object.keys(value)) if (services[key] === value[key]) delete services[key]; };
}
