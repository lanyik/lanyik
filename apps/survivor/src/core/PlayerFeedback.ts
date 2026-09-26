/** Lossy, fixed-size presentation mailboxes. Never saved or consumed by gameplay. */
export class PlayerFeedback {
    public attackTick = -1;
    public attackHeading = 0;
    public attackDuration = 0;
    public castTick = -1;
    public hurtTick = -1;
    public impactTick = -1;
    public pickupTick = -1;
    public castPhase = 0;
    public castProgress = 0;
    public castHeading = 0;
}
