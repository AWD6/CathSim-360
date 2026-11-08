/** Only verbatim, page-referenced approved source content belongs here.
 * The referenced PDF did not transfer from the prior conversation.
 * No guessed procedural rules, passing thresholds or safety claims are supplied.
 */
export const clinicalSource = {
  status: 'awaiting-source' as const,
  file: 'คู่มือปฏิบัติงานสำหรับพยาบาลในการดูเเลผ.pdf',
  chapter: 4,
  excerpts: [] as { page: number; text: string; audience: 'patient-caregiver' | 'nurse'; approved: boolean }[],
};
export const clinicalAssessmentEnabled = () => clinicalSource.status !== 'awaiting-source' && clinicalSource.excerpts.length > 0;
