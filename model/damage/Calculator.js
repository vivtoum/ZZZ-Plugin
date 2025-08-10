import { elementEnum, anomalyEnum } from './BuffManager.js';
import * as prop from '../../lib/convert/property.js';
import { getMapData } from '../../utils/file.js';
import { charData } from './avatar.js';
import _ from 'lodash';
const elementType2element = (elementType) => elementEnum[[0, 1, 2, 3, -1, 4][elementType - 200]];
const subBaseValueData = {
    "生命值百分比": [0.03, '3.0%'],
    "生命值": [112, '112'],
    "攻击力百分比": [0.03, '3.0%'],
    "攻击力": [19, '19'],
    "防御力百分比": [0.048, '4.8%'],
    "防御力": [15, '15'],
    "暴击率": [0.024, '2.4%'],
    "暴击伤害": [0.048, '4.8%'],
    "穿透值": [9, '9'],
    "异常精通": [9, '9']
};
const mainBaseValueData = {
    "生命值百分比": [0.3, '30%'],
    "攻击力百分比": [0.3, '30%'],
    "防御力百分比": [0.48, '48%'],
    "暴击率": [0.24, '24%'],
    "暴击伤害": [0.48, '48%'],
    "异常精通": [92, '92'],
    "穿透率": [0.24, '24%'],
    "物理属性伤害加成": [0.3, '30%'],
    "火属性伤害加成": [0.3, '30%'],
    "冰属性伤害加成": [0.3, '30%'],
    "电属性伤害加成": [0.3, '30%'],
    "以太属性伤害加成": [0.3, '30%'],
    "异常掌控": [0.3, '30%'],
    "冲击力": [0.18, '18%'],
    "能量自动回复": [0.6, '60%']
};
const AnomalyData = getMapData('AnomalyData');
export class Calculator {
    buffM;
    avatar;
    skills = [];
    usefulBuffResults = new Map();
    cache = Object.create(null);
    props = {};
    skill;
    defaultSkill = {};
    enemy;
    constructor(buffM) {
        this.buffM = buffM;
        this.avatar = this.buffM.avatar;
        this.enemy = {
            level: this.avatar.level,
            basicDEF: 50,
            resistance: 0.2
        };
    }
    get initial_properties() {
        return this.avatar.initial_properties;
    }
    defEnemy(param, value) {
        if (typeof param === 'string' && value !== undefined) {
            this.enemy[param] = value;
        }
        else if (typeof param === 'object') {
            _.merge(this.enemy, param);
        }
    }
    new(skill) {
        if (Array.isArray(skill)) {
            skill.forEach(s => this.new(s));
            return this.skills;
        }
        const oriSkill = skill;
        skill = _.merge({
            ...this.defaultSkill
        }, skill);
        if (!skill.element)
            skill.element = oriSkill.element = elementType2element(this.avatar.element_type);
        if (!skill.name || !skill.type)
            return logger.warn('无效skill：', skill);
        if (skill.check && +skill.check) {
            const num = skill.check;
            skill.check = oriSkill.check = ({ avatar }) => avatar.rank >= num;
        }
        this.skills.push(skill);
        return this.skills;
    }
    calc_skill(skill) {
        if (typeof skill === 'string') {
            const MySkill = this.skills.find(s => s.type === skill);
            if (!MySkill)
                return;
            return this.calc_skill(MySkill);
        }
        this.skill = skill;
        if (!skill.banCache && this.cache[skill.type])
            return this.cache[skill.type];
        if (skill.check && !skill.check({ avatar: this.avatar, buffM: this.buffM, calc: this }))
            return;
        logger.debug(`${logger.green(skill.type)}${skill.name}伤害计算：`);
        if (skill.dmg) {
            const dmg = skill.dmg(this);
            if (!dmg.skill || dmg.skill.name !== skill.name) {
                dmg.skill = skill;
            }
            logger.debug('自定义计算最终伤害：', dmg.result);
            return dmg;
        }
        const props = this.props = skill.props || {};
        const usefulBuffs = this.buffM.filter({
            element: skill.element,
            range: [skill.type],
            redirect: skill.redirect
        }, this);
        const areas = {};
        if (skill.before)
            skill.before({ avatar: this.avatar, calc: this, usefulBuffs, skill, props, areas });
        const isAnomaly = typeof anomalyEnum[skill.type.slice(0, 2)] === 'number';
        if (!areas.BasicArea) {
            let Multiplier = props.倍率;
            if (!Multiplier) {
                if (skill.fixedMultiplier) {
                    Multiplier = skill.fixedMultiplier;
                }
                else if (isAnomaly) {
                    Multiplier = (skill.type.startsWith('紊乱') ?
                        this.get_DiscoverMultiplier(skill) :
                        this.get_AnomalyMultiplier(skill, usefulBuffs, skill.name.includes('每') ? 1 : 0)) || 0;
                }
                else {
                    if (skill.skillMultiplier)
                        Multiplier = skill.skillMultiplier[this.get_SkillLevel(skill.type[0]) - 1];
                    else
                        Multiplier = this.get_SkillMultiplier(skill.type);
                }
                const ExtraMultiplier = this.get_ExtraMultiplier(skill, usefulBuffs);
                Multiplier += ExtraMultiplier;
                if (!Multiplier)
                    return logger.warn('技能倍率缺失：', skill);
                if (ExtraMultiplier)
                    logger.debug(`最终倍率：${Multiplier}`);
            }
            props.倍率 = Multiplier;
            this.get_ATK(skill, usefulBuffs);
            areas.BasicArea = props.攻击力 * props.倍率;
        }
        logger.debug(`基础伤害区：${areas.BasicArea}`);
        if (isAnomaly) {
            areas.AnomalyProficiencyArea ??= this.get_AnomalyProficiencyArea(skill, usefulBuffs);
            areas.AnomalyBoostArea ??= this.get_AnomalyBoostArea(skill, usefulBuffs);
            areas.LevelArea ??= this.get_LevelArea();
            if (!skill.type.startsWith('紊乱')) {
                props.异常暴击率 ??= this.get_AnomalyCRITRate(skill, usefulBuffs);
                props.异常暴击伤害 ??= this.get_AnomalyCRITDMG(skill, usefulBuffs);
                areas.CriticalArea ??= 1 + props.异常暴击率 * (props.异常暴击伤害 - 1);
            }
        }
        else {
            props.暴击率 ??= this.get_CRITRate(skill, usefulBuffs);
            props.暴击伤害 ??= this.get_CRITDMG(skill, usefulBuffs);
            areas.CriticalArea ??= 1 + props.暴击率 * (props.暴击伤害 - 1);
        }
        areas.CriticalArea ??= 1;
        logger.debug(`暴击期望：${areas.CriticalArea}`);
        areas.BoostArea ??= this.get_BoostArea(skill, usefulBuffs);
        areas.VulnerabilityArea ??= this.get_VulnerabilityArea(skill, usefulBuffs);
        areas.ResistanceArea ??= this.get_ResistanceArea(skill, usefulBuffs);
        areas.DefenceArea ??= this.get_DefenceArea(skill, usefulBuffs);
        const { BasicArea, CriticalArea, BoostArea, VulnerabilityArea, ResistanceArea, DefenceArea, AnomalyProficiencyArea, LevelArea, AnomalyBoostArea } = areas;
        const { 暴击伤害, 异常暴击伤害 } = props;
        const result = isAnomaly ?
            {
                critDMG: (CriticalArea !== 1) ? BasicArea * 异常暴击伤害 * BoostArea * VulnerabilityArea * ResistanceArea * DefenceArea * AnomalyProficiencyArea * LevelArea * AnomalyBoostArea : 0,
                expectDMG: BasicArea * CriticalArea * BoostArea * VulnerabilityArea * ResistanceArea * DefenceArea * AnomalyProficiencyArea * LevelArea * AnomalyBoostArea
            } : {
            critDMG: BasicArea * 暴击伤害 * BoostArea * VulnerabilityArea * ResistanceArea * DefenceArea,
            expectDMG: BasicArea * CriticalArea * BoostArea * VulnerabilityArea * ResistanceArea * DefenceArea
        };
        const damage = { skill, usefulBuffs: _.sortBy(Array.from(this.usefulBuffResults.values()), ['type', 'value']).reverse(), props, areas, result };
        this.usefulBuffResults.clear();
        if (skill.after) {
            damage.add = (d) => {
                if (typeof d === 'string')
                    d = this.calc_skill(d);
                if (!d)
                    return;
                logger.debug('增加伤害：' + d.skill.name, d.result);
                damage.result.expectDMG += d.result.expectDMG;
                damage.result.critDMG += d.result.critDMG || d.result.expectDMG;
            };
            damage.fnc = (fnc) => {
                damage.result.critDMG = fnc(damage.result.critDMG);
                damage.result.expectDMG = fnc(damage.result.expectDMG);
            };
            damage.x = (n) => {
                logger.debug('伤害系数：' + n);
                damage.fnc(v => v * n);
            };
            skill.after({ avatar: this.avatar, calc: this, usefulBuffs, skill, damage });
            delete damage.add, delete damage.fnc, delete damage.x;
        }
        logger.debug('最终伤害：', result);
        if (!skill.banCache)
            this.cache[skill.type] = damage;
        return damage;
    }
    calc() {
        return this.skills.map(skill => {
            try {
                return this.calc_skill(skill);
            }
            catch (e) {
                logger.error('伤害计算错误：', e);
                return;
            }
        }).filter(v => v && v.result?.expectDMG && !v.skill?.isHide);
    }
    calc_sub_differences(skill, types) {
        if (!types || !types.length) {
            types = Object.entries(this.avatar.scoreWeight)
                .reduce((acc, [id, weight]) => {
                if (weight > 0) {
                    const type = prop.idToName(id);
                    if (type && subBaseValueData[type]) {
                        acc.push({ type, weight });
                    }
                }
                return acc;
            }, [])
                .sort((a, b) => b.weight - a.weight)
                .slice(0, 6)
                .map(({ type }) => type);
        }
        const base = {};
        types.forEach(t => base[t] = t.includes('百分比') ? this.avatar.base_properties[prop.nameZHToNameEN(t.replace('百分比', ''))] * subBaseValueData[t][0] : subBaseValueData[t][0]);
        logger.debug('词条变化值：', base);
        const buffs = types.map(t => ({
            name: t,
            shortName: prop.nameToShortName3(t),
            type: t.replace('百分比', ''),
            value: base[t],
            valueBase: subBaseValueData[t][1]
        }));
        buffs.push({
            name: '空白对照',
            shortName: '对照组',
            type: '',
            value: 0,
            valueBase: '0'
        });
        return this.calc_differences(buffs, skill);
    }
    calc_main_differences(skill, types) {
        if (!types || !types.length) {
            types = Object.entries(this.avatar.scoreWeight)
                .reduce((acc, [id, weight]) => {
                if (weight > 0) {
                    const type = prop.idToName(id);
                    if (type && mainBaseValueData[type]) {
                        acc.push({ type, weight });
                    }
                }
                return acc;
            }, [])
                .sort((a, b) => b.weight - a.weight)
                .slice(0, 6)
                .map(({ type }) => type);
        }
        const base = {};
        types.forEach(t => base[t] = (t.includes('百分比') || ['异常掌控', '冲击力', '能量自动回复'].includes(t)) ? this.avatar.base_properties[prop.nameZHToNameEN(t.replace('百分比', ''))] * mainBaseValueData[t][0] : mainBaseValueData[t][0]);
        logger.debug(logger.red('词条变化值：'), base);
        const buffs = types.map(t => {
            const data = {
                name: t,
                shortName: prop.nameToShortName3(t),
                type: (t.includes('属性伤害加成') ? '增伤' : t.replace('百分比', '')),
                value: base[t],
                element: (t.includes('属性伤害加成') ? prop.nameZHToNameEN(t).replace('DMGBonus', '') : ''),
                valueBase: mainBaseValueData[t][1]
            };
            if (!data.element)
                delete data.element;
            return data;
        });
        buffs.push({
            name: '空白对照',
            shortName: '对照组',
            type: '',
            value: 0,
            valueBase: '0'
        });
        const equips = this.avatar.equip.reduce((acc, e) => {
            if (e.equipment_type < 4)
                return acc;
            const name = e.main_properties[0]?.property_name;
            if (name)
                acc.push(name);
            return acc;
        }, ['空白对照']);
        const main_differences = this.calc_differences(buffs, skill);
        return main_differences.filter(v => {
            const name1 = v[0].del.name.replace('百分比', '');
            const name2 = name1.replace('属性', '');
            return equips.some(e => e === name1 || e === name2);
        });
    }
    calc_differences(buffs, skill) {
        if (!skill) {
            skill = this.skills.find((skill) => skill.isMain)
                || this.calc().sort((a, b) => b.result.expectDMG - a.result.expectDMG)[0]?.skill;
        }
        else if (typeof skill === 'string') {
            const MySkill = this.skills.find(s => s.type === skill);
            if (!MySkill)
                return [];
            return this.calc_differences(buffs, MySkill);
        }
        const oriDamage = this.calc_skill(skill);
        this.cache = Object.create(null);
        const result = [];
        for (const i_del in buffs) {
            result[i_del] = [];
            const buff_del = buffs[i_del];
            const { name: name_del = buff_del.type, value: value_del } = buff_del;
            logger.debug(logger.blue(`差异计算：${name_del}`));
            this.buffM.buffs.push({
                ...buff_del,
                name: logger.green(`差异计算：${name_del}`),
                value: ({ calc }) => -calc.calc_value(value_del)
            });
            for (const i_add in buffs) {
                const buff_add = buffs[i_add];
                buff_add.name ??= buff_add.type;
                const data = result[i_del][i_add] = {
                    add: buff_add,
                    del: buff_del,
                    damage: oriDamage,
                    difference: 0
                };
                const { name: name_add = buff_add.type } = buff_add;
                if (name_del === name_add)
                    continue;
                logger.debug(logger.yellow(`差异计算：${name_del}->${name_add}`));
                this.buffM.buffs.push({
                    ...buff_add,
                    name: logger.green(`差异计算：${name_del}->${name_add}`)
                });
                const newDamage = this.calc_skill(skill);
                this.buffM.buffs.pop();
                this.cache = Object.create(null);
                data.damage = newDamage;
                data.difference = newDamage.result.expectDMG - oriDamage.result.expectDMG;
                logger.debug(logger.magenta(`差异计算：${name_del}->${name_add} 伤害变化：${data.difference}`));
            }
            this.buffM.buffs.pop();
        }
        return result;
    }
    default(param, value) {
        if (typeof param === 'object') {
            this.defaultSkill = param;
        }
        else {
            if (value === undefined)
                delete this.defaultSkill[param];
            else
                this.defaultSkill[param] = value;
        }
    }
    get_SkillLevel(baseType) {
        const id = ['A', 'E', 'C', 'R', , 'T', 'L'].indexOf(baseType);
        if (id === -1)
            return 1;
        return Number(this.avatar.skills.find(({ skill_type }) => skill_type === id)?.level || 1);
    }
    get_SkillMultiplier(type) {
        const SkillLevel = this.get_SkillLevel(type[0]);
        logger.debug(`${type[0]}等级：${SkillLevel}`);
        const Multiplier = charData[this.avatar.id].skill[type]?.[SkillLevel - 1];
        logger.debug(`技能倍率：${Multiplier}`);
        return Multiplier;
    }
    get_AnomalyData(anomaly) {
        if (!anomaly) {
            return AnomalyData.find(({ element_type, sub_element_type, multiplier }) => multiplier &&
                element_type === this.avatar.element_type &&
                sub_element_type === this.avatar.sub_element_type);
        }
        let a = AnomalyData.filter(({ element_type }) => element_type === this.avatar.element_type);
        if (anomaly === '紊乱')
            a = a.filter(({ discover }) => discover);
        else
            a = a.filter(({ name, multiplier }) => name === anomaly && multiplier);
        if (a.length === 1)
            return a[0];
        a = a.filter(({ sub_element_type }) => sub_element_type === this.avatar.sub_element_type);
        return a[0];
    }
    get_AnomalyMultiplier(skill, usefulBuffs, times = 0) {
        const anomalyData = this.get_AnomalyData(skill?.type.slice(0, 2));
        if (!anomalyData)
            return;
        if (!times && anomalyData.duration && anomalyData.interval) {
            const AnomalyDuration = this.get_AnomalyDuration(skill, usefulBuffs, anomalyData.duration);
            times = Math.floor((AnomalyDuration * 10) / (anomalyData.interval * 10));
        }
        const Multiplier = anomalyData.multiplier * (times || 1);
        logger.debug(`倍率：${Multiplier}`);
        return Multiplier;
    }
    get_DiscoverMultiplier(skill) {
        const anomalyData = this.get_AnomalyData(skill?.type.slice(0, 2));
        if (!anomalyData)
            return;
        const AnomalyDuration = this.get_AnomalyDuration({
            ...skill,
            name: anomalyData.name,
            type: anomalyData.name
        }, this.buffM.buffs, anomalyData.duration);
        const times = Math.floor((AnomalyDuration * 10) / (anomalyData.interval * 10));
        const discover = anomalyData.discover;
        const Multiplier = discover.fixed_multiplier + times * discover.multiplier;
        logger.debug(`${anomalyData.name}紊乱倍率：${Multiplier}`);
        return Multiplier;
    }
    calc_value(value, buff) {
        switch (typeof value) {
            case 'number': return value;
            case 'function': {
                if (buff)
                    buff.status = false;
                const v = +value({ avatar: this.avatar, buffM: this.buffM, calc: this }) || 0;
                if (buff)
                    buff.status = true;
                return v;
            }
            case 'string': return charData[this.avatar.id].buff?.[value]?.[this.get_SkillLevel(value[0]) - 1] || 0;
            case 'object': {
                if (!Array.isArray(value) || !buff)
                    return 0;
                switch (buff.source) {
                    case '音擎': return value[this.avatar.weapon.star - 1] || 0;
                    case '核心被动':
                    case '额外能力': return value[this.get_SkillLevel('T') - 1] || 0;
                }
            }
            default: return 0;
        }
    }
    get(type, initial, skill = this.skill, usefulBuffs = this.buffM.buffs, isRatio = false) {
        return this.props[type] ??= this.buffM._filter(usefulBuffs, {
            element: skill?.element,
            range: [skill?.type],
            redirect: skill?.redirect,
            type
        }, this).reduce((previousValue, buff) => {
            const { value } = buff;
            let add = this.calc_value(value, buff);
            if (isRatio && Math.abs(add) < 1 && (typeof value === 'number' || typeof value === 'string' || Array.isArray(value)))
                add *= initial;
            if (!this.usefulBuffResults.has(buff))
                this.usefulBuffResults.set(buff, { ...buff, value: add });
            logger.debug(`\tBuff：${buff.name}对${(buff.include ? (buff.range ? [buff.range, buff.include] : buff.include) : buff.range) || '全类型'}增加${add}${buff.element || ''}${type}`);
            return previousValue + add;
        }, initial);
    }
    get_ATK(skill, usefulBuffs) {
        let ATK = this.get('攻击力', this.initial_properties.ATK, skill, usefulBuffs, true);
        ATK = Math.max(0, Math.min(ATK, 10000));
        logger.debug(`攻击力：${ATK}`);
        return ATK;
    }
    get_ExtraMultiplier(skill, usefulBuffs) {
        const ExtraMultiplier = this.get('倍率', 0, skill, usefulBuffs);
        ExtraMultiplier && logger.debug(`额外倍率：${ExtraMultiplier}`);
        return ExtraMultiplier;
    }
    get_CRITRate(skill, usefulBuffs) {
        let CRITRate = this.get('暴击率', this.initial_properties.CRITRate, skill, usefulBuffs);
        CRITRate = Math.max(0, Math.min(CRITRate, 1));
        logger.debug(`暴击率：${CRITRate}`);
        return CRITRate;
    }
    get_CRITDMG(skill, usefulBuffs) {
        let CRITDMG = this.get('暴击伤害', this.initial_properties.CRITDMG + 1, skill, usefulBuffs);
        CRITDMG = Math.max(0, Math.min(CRITDMG, 5));
        logger.debug(`暴击伤害：${CRITDMG}`);
        return CRITDMG;
    }
    get_BoostArea(skill, usefulBuffs) {
        const BoostArea = this.get('增伤', 1, skill, usefulBuffs);
        logger.debug(`增伤区：${BoostArea}`);
        return BoostArea;
    }
    get_VulnerabilityArea(skill, usefulBuffs) {
        const VulnerabilityArea = this.get('易伤', 1, skill, usefulBuffs);
        logger.debug(`易伤区：${VulnerabilityArea}`);
        return VulnerabilityArea;
    }
    get_ResistanceArea(skill, usefulBuffs) {
        let ResistanceArea = this.get('无视抗性', 1 + this.enemy.resistance, skill, usefulBuffs);
        ResistanceArea = Math.min(2, ResistanceArea);
        logger.debug(`抗性区：${ResistanceArea}`);
        return ResistanceArea;
    }
    get_IgnoreDEF(skill, usefulBuffs) {
        const IgnoreDEF = this.get('无视防御', 0, skill, usefulBuffs);
        IgnoreDEF && logger.debug(`无视防御：${IgnoreDEF}`);
        return IgnoreDEF;
    }
    get_Pen(skill, usefulBuffs) {
        let Pen = this.get('穿透值', this.initial_properties.Pen, skill, usefulBuffs);
        Pen = Math.min(Pen, 1000);
        Pen && logger.debug(`穿透值：${Pen}`);
        return Pen;
    }
    get_PenRatio(skill, usefulBuffs) {
        let PenRatio = this.get('穿透率', this.initial_properties.PenRatio, skill, usefulBuffs);
        PenRatio = Math.min(PenRatio, 2);
        PenRatio && logger.debug(`穿透率：${PenRatio}`);
        return PenRatio;
    }
    get_DefenceArea(skill, usefulBuffs) {
        const get_base = (level) => Math.floor(0.1551 * Math.min(60, level) ** 2 + 3.141 * Math.min(60, level) + 47.2039);
        const base = get_base(this.avatar.level);
        const DEF = this.enemy.basicDEF / 50 * get_base(this.enemy.level);
        const IgnoreDEF = this.get_IgnoreDEF(skill, usefulBuffs);
        const Pen = this.get_Pen(skill, usefulBuffs);
        const PenRatio = this.get_PenRatio(skill, usefulBuffs);
        const defence = DEF * (1 - IgnoreDEF);
        const effective_defence = Math.max(0, defence * (1 - PenRatio) - Pen);
        const DefenceArea = base / (effective_defence + base);
        logger.debug(`防御区：${DefenceArea}`);
        return DefenceArea;
    }
    get_LevelArea(level = this.avatar.level) {
        const LevelArea = +(1 + 1 / 59 * (level - 1)).toFixed(4);
        logger.debug(`等级区：${LevelArea}`);
        return LevelArea;
    }
    get_AnomalyProficiency(skill, usefulBuffs) {
        let AnomalyProficiency = this.get('异常精通', this.initial_properties.AnomalyProficiency, skill, usefulBuffs);
        AnomalyProficiency = Math.max(0, Math.min(AnomalyProficiency, 1000));
        logger.debug(`异常精通：${AnomalyProficiency}`);
        return AnomalyProficiency;
    }
    get_AnomalyProficiencyArea(skill, usefulBuffs) {
        const AnomalyProficiency = this.get_AnomalyProficiency(skill, usefulBuffs);
        const AnomalyProficiencyArea = AnomalyProficiency / 100;
        logger.debug(`异常精通区：${AnomalyProficiencyArea}`);
        return AnomalyProficiencyArea;
    }
    get_AnomalyBoostArea(skill, usefulBuffs) {
        const AnomalyBoostArea = this.get('异常增伤', 1, skill, usefulBuffs);
        AnomalyBoostArea && logger.debug(`异常增伤区：${AnomalyBoostArea}`);
        return AnomalyBoostArea;
    }
    get_AnomalyCRITRate(skill, usefulBuffs) {
        let AnomalyCRITRate = this.get('异常暴击率', 0, skill, usefulBuffs);
        AnomalyCRITRate = Math.max(0, Math.min(AnomalyCRITRate, 1));
        AnomalyCRITRate && logger.debug(`异常暴击率：${AnomalyCRITRate}`);
        return AnomalyCRITRate;
    }
    get_AnomalyCRITDMG(skill, usefulBuffs) {
        let AnomalyCRITDMG = this.get('异常暴击伤害', 1, skill, usefulBuffs);
        AnomalyCRITDMG = Math.max(0, Math.min(AnomalyCRITDMG, 5));
        AnomalyCRITDMG && logger.debug(`异常暴击伤害：${AnomalyCRITDMG}`);
        return AnomalyCRITDMG;
    }
    get_AnomalyDuration(skill, usefulBuffs, duration = 0) {
        const AnomalyDuration = +this.get('异常持续时间', duration, skill, usefulBuffs).toFixed(1);
        logger.debug(`异常持续时间：${AnomalyDuration}`);
        return AnomalyDuration;
    }
    get_HP(skill, usefulBuffs) {
        let HP = this.get('生命值', this.initial_properties.HP, skill, usefulBuffs, true);
        HP = Math.max(0, Math.min(HP, 100000));
        logger.debug(`生命值：${HP}`);
        return HP;
    }
    get_DEF(skill, usefulBuffs) {
        let DEF = this.get('防御力', this.initial_properties.DEF, skill, usefulBuffs, true);
        DEF = Math.max(0, Math.min(DEF, 1000));
        logger.debug(`防御力：${DEF}`);
        return DEF;
    }
    get_Impact(skill, usefulBuffs) {
        let Impact = this.get('冲击力', this.initial_properties.Impact, skill, usefulBuffs, true);
        Impact = Math.max(0, Math.min(Impact, 1000));
        logger.debug(`冲击力：${Impact}`);
        return Impact;
    }
    get_AnomalyMastery(skill, usefulBuffs) {
        let AnomalyMastery = this.get('异常掌控', this.initial_properties.AnomalyMastery, skill, usefulBuffs, true);
        AnomalyMastery = Math.max(0, Math.min(AnomalyMastery, 1000));
        logger.debug(`异常掌控：${AnomalyMastery}`);
        return AnomalyMastery;
    }
}
