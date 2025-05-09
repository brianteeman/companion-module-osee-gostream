import { sendCommand, sendCommands } from '../../connection'
import { ReqType } from '../../enums'
import type { GoStreamModel } from '../../models/types'
import { GoStreamCmd } from '../../connection'

// note: this is intentionally NOT exported: CommunicationID should not be accessible to the action/feedback definitions
// whether it ultimately remains here in state.ts or is bumped down to a lower level.
enum CommunicationId {
	Record = 'record',
	RecordTime = 'recordTime',
	RecordFileName = 'recordFileName',
	// It needs to be 'quality' for the communication protocol
	RecordQuality = 'quality',
	RecordFreeSpace = 'sdFreeSpace',
	RecordFreeTime = 'sdFreeTime',
	RecordFree = 'sdFree',
	RecordMediaPresent = 'sdCardStatus',
	BuildInfo = 'buildInfo',
}
export class RecordStateT {
	model: GoStreamModel
	isRecording = false
	recordTime = ''
	fwVersion: number | undefined // this is a temporary fix for determining quality
	quality: string | undefined
	freeSpace: string | undefined
	freeTime: string | undefined
	freeSpaceTime: string | undefined
	storageMediaPresent = false
	constructor(model: GoStreamModel) {
		this.model = model
	}

	// Start/Stop recording
	async setRecordState(recording: boolean): Promise<boolean> {
		return sendCommand(CommunicationId.Record, ReqType.Set, [recording ? 1 : 0])
	}
	// Recording-file name
	async setRecordFilename(newName: string): Promise<boolean> {
		// allow but replace ":" and other invalid chars, so user can specify system time in the variable
		return sendCommand(CommunicationId.RecordFileName, ReqType.Set, [newName.replaceAll(/[\\/:*?"<>|]/g, '_')])
	}

	// Recording Quality
	qualityValues(_protocolOrder = false): string[] {
		// setting protocolOrder to true guarantees it will correspond to the
		//  Osee communication protocol's index numbers. In this case it's a noop
		if (this.fwVersion && this.fwVersion <= 0x0b663530) {
			return ['high', 'medium', 'low']
		} else {
			return ['high', 'good', 'medium', 'low']
		}
	}

	async setRecordingQuality(quality: string): Promise<boolean> {
		// the first value is 0 = recording, 1 = streaming
		return sendCommand(CommunicationId.RecordQuality, ReqType.Set, [0, this.qualityValues(true).indexOf(quality)])
	}

	decodeRecordingQuality(vals: number[]): string | undefined {
		// only save it if it's a recording quality
		if (vals[0] === 0 && vals.length === 2) {
			const qualities = this.qualityValues(true)
			return qualities[vals[1]]
		} else {
			return undefined
		}
	}
}

export async function sync(_model: GoStreamModel): Promise<boolean> {
	const cmds: GoStreamCmd[] = [
		{ id: CommunicationId.Record, type: ReqType.Get },
		{ id: CommunicationId.RecordQuality, type: ReqType.Get, value: [0] },
		{ id: CommunicationId.RecordFreeSpace, type: ReqType.Get, value: [0] },
		{ id: CommunicationId.RecordFreeTime, type: ReqType.Get, value: [0] },
		{ id: CommunicationId.RecordFree, type: ReqType.Get, value: [0] },
		{ id: CommunicationId.RecordMediaPresent, type: ReqType.Get, value: [0] },
	]
	return sendCommands(cmds)
}

export function update(state: RecordStateT, data: GoStreamCmd): boolean {
	let version
	let quality
	switch (data.id as CommunicationId) {
		case CommunicationId.Record:
			state.isRecording = Boolean(data.value![0])
			break
		case CommunicationId.RecordTime:
			state.recordTime = String(data.value![0])
			break
		case CommunicationId.BuildInfo: // note 'version' is not as reliable, since 2.2 betas were given 1.0 version numbers
			version = state.fwVersion
			state.fwVersion = parseInt('0x' + String(data.value![0]))
			if (version != state.fwVersion) {
				// solve problems arising from the fact that state.fwVersion is initially undefined...
				void sync(state.model) // this forces state and variables to update.
				return true // rebuild actions, if buildInfo changed
			}
			break
		case CommunicationId.RecordQuality:
			quality = state.decodeRecordingQuality(<number[]>data.value)
			if (quality != undefined) {
				state.quality = quality
			}
			break
		case CommunicationId.RecordFreeSpace:
			state.freeSpace = String(data.value![0])
			break
		case CommunicationId.RecordFreeTime:
			state.freeTime = String(data.value![0])
			break
		case CommunicationId.RecordFree:
			state.freeSpaceTime = String(data.value![0])
			break
		case CommunicationId.RecordMediaPresent:
			state.storageMediaPresent = Boolean(data.value![0])
			break
	}
	return false
}
