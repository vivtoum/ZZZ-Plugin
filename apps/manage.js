import { ZZZPlugin } from '../lib/plugin.js';
import { rulePrefix } from '../lib/common.js';
import { getAllCharactersID } from '../lib/convert/char.js';
import { getAllEquipID } from '../lib/convert/equip.js';
import { getAllWeaponID } from '../lib/convert/weapon.js';
import { imageResourcesPath } from '../lib/path.js';
import settings from '../lib/settings.js';
import fs from 'fs';
import {
  getRoleImage,
  getSquareAvatar,
  getSuitImage,
  getWeaponImage,
} from '../lib/download.js';
import _ from 'lodash';

export class Panel extends ZZZPlugin {
  constructor() {
    super({
      name: '[ZZZ-Plugin]Manage',
      dsc: 'zzzmanage',
      event: 'message',
      priority: _.get(settings.getConfig('priority'), 'manage', 70),
      rule: [
        {
          reg: `${rulePrefix}下载(全部|所有)资源$`,
          fnc: 'downloadAll',
        },
        {
          reg: `${rulePrefix}删除(全部|所有)资源$`,
          fnc: 'deleteAll',
        },
      ],
    });
  }
  async downloadAll() {
    if (!this.e.isMaster) return false;
    const charIDs = getAllCharactersID();
    const equipSprites = getAllEquipID();
    const weaponSprites = getAllWeaponID();
    const result = {
      char: {
        success: 0,
        failed: 0,
        total: charIDs.length,
      },
      charSquare: {
        success: 0,
        failed: 0,
        total: charIDs.length,
      },
      equip: {
        success: 0,
        failed: 0,
        total: equipSprites.length,
      },
      weapon: {
        success: 0,
        failed: 0,
        total: weaponSprites.length,
      },
    };
    await this.reply(
      '开始下载资源，注意，仅支持下载面板的角色图、武器图、套装图，以及角色卡片的角色头像图。暂不支持下载邦布头像。'
    );
    for (const id of charIDs) {
      try {
        await getSquareAvatar(id);
        result.charSquare.success++;
      } catch (error) {
        logger.error('getSquareAvatar', id, error);
        result.charSquare.failed++;
      }
      try {
        await getRoleImage(id);
        result.char.success++;
      } catch (error) {
        logger.error('getRoleImage', id, error);
        result.char.failed++;
      }
    }
    for (const sprite of equipSprites) {
      try {
        await getSuitImage(sprite);
        result.equip.success++;
      } catch (error) {
        logger.error('getSuitImage', sprite, error);
        result.equip.failed++;
      }
    }
    for (const sprite of weaponSprites) {
      try {
        await getWeaponImage(sprite);
        result.weapon.success++;
      } catch (error) {
        logger.error('getWeaponImage', sprite, error);
        result.weapon.failed++;
      }
    }
    const messages = [
      '资源下载完成（成功的包含先前下载的图片）',
      '角色图需下载' +
        charIDs.length +
        '张，成功' +
        result.char.success +
        '张，失败' +
        result.char.failed +
        '张',
      '角色头像图需下载' +
        charIDs.length +
        '张，成功' +
        result.charSquare.success +
        '张，失败' +
        result.charSquare.failed +
        '张',
      '套装图需下载' +
        equipSprites.length +
        '张，成功' +
        result.equip.success +
        '张，失败' +
        result.equip.failed +
        '张',
      '武器图需下载' +
        weaponSprites.length +
        '张，成功' +
        result.weapon.success +
        '张，失败' +
        result.weapon.failed +
        '张',
    ];
    await this.reply(messages.join('\n'));
  }
  async deleteAll() {
    if (!this.e.isMaster) return false;
    await this.reply('【注意】正在删除所有资源图片，后续使用需要重新下载！');
    if (fs.existsSync(imageResourcesPath)) {
      fs.rmdirSync(imageResourcesPath, { recursive: true });
    }
    await this.reply('资源图片已删除！');
  }
}
