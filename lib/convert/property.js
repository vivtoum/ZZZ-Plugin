const prop_id = {
  111: 'hpmax',
  121: 'attack',
  131: 'def',
  122: 'breakstun',
  201: 'crit',
  211: 'critdam',
  314: 'elementabnormalpower',
  312: 'elementmystery',
  231: 'penratio',
  232: 'penvalue',
  305: 'sprecover',
  310: 'spgetratio',
  115: 'spmax',
  315: 'physdmg',
  316: 'fire',
  317: 'ice',
  318: 'thunder',
  319: 'dungeonbuffether',
};

const pro_id = {
  1: 'attack',
  2: 'stun',
  3: 'anomaly',
  4: 'support',
  5: 'defense',
};

/**
 * 获取属性css类名
 * @param {string} _id 属性id
 * @returns {string | null}
 */
export function idToClassName(_id) {
  let propId = _id.toString();
  propId = propId.slice(0, 3);
  const propIcon = prop_id[propId];
  if (!propIcon) return null;
  return propIcon;
}