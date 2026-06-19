import axios, { AxiosInstance } from 'axios'
import type { TenderEvent, TenderEventType } from '../monitor/event.types.js'
import type { ProzorroTender } from '../prozorro/tender.types.js'

const eventLabels: Record<TenderEventType, string> = {
	STATUS_CHANGED: 'Змінено статус закупівлі',
	DOCUMENT_ADDED: 'Додано новий документ',
	DOCUMENT_UPDATED: 'Оновлено документ',
	COMPLAINT_ADDED: 'Подано нову скаргу',
	COMPLAINT_STATUS_CHANGED: 'Змінено статус скарги',
	QUESTION_ADDED: 'Поставлено нове питання',
	QUESTION_ANSWERED: 'Надано відповідь на питання',
	QUALIFICATION_ADDED: 'Додано кваліфікацію учасника',
	QUALIFICATION_STATUS_CHANGED: 'Змінено статус кваліфікації',
	CONTRACT_ADDED: 'Додано договір',
	CONTRACT_STATUS_CHANGED: 'Змінено статус договору',
	MONITORING_STARTED: 'Розпочато моніторинг за закупівлею',
	MONITORING_STATUS_CHANGED: 'Змінено статус моніторингу',
	MONITORING_CONCLUSION_ADDED: 'Опубліковано висновок моніторингу',
	MONITORING_CLOSED: 'Моніторинг завершено або закрито',
}

const severityLabels: Record<TenderEvent['severity'], string> = {
	info: 'інформаційний',
	warning: 'увага',
	critical: 'критичний',
}

export class TelegramClient {
	private readonly http: AxiosInstance

	constructor(
		botToken: string,
		private readonly chatId: string,
	) {
		this.http = axios.create({
			baseURL: `https://api.telegram.org/bot${botToken}`,
			timeout: 15000,
		})
	}

	async sendEvent(event: TenderEvent, tender: ProzorroTender): Promise<void> {
		await this.http.post('/sendMessage', {
			chat_id: this.chatId,
			text: formatMessage(event, tender),
			disable_web_page_preview: true,
		})
	}
}

function formatMessage(event: TenderEvent, tender: ProzorroTender): string {
	const details = formatDetails(event.details)
	return [
		'🔔 Оновлення у закупівлі',
		'',
		`Закупівля: ${event.tenderId}`,
		`Уповноважена особа: ${event.responsiblePerson}`,
		'',
		`Подія: ${eventLabels[event.eventType]}`,
		`Рівень: ${severityLabels[event.severity]}`,
		'',
		`Назва: ${tender.title ?? ''}`,
		`Статус: ${tender.status ?? ''}`,
		'',
		`Деталі: ${details}`,
		'',
		`Потрібна реакція: ${event.needsAction ? 'Так' : 'Ні'}`,
	].join('\n')
}

function formatDetails(details: string | undefined): string {
	if (!details?.trim()) {
		return 'Без додаткових деталей'
	}

	if (/^[a-f0-9]{24,32}$/i.test(details.trim())) {
		return 'Технічні деталі збережено в таблиці Events'
	}

	return details
}
