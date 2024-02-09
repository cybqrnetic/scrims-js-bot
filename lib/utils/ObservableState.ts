export class ObservableState<StateType> {
    protected updateCalls = new Set<(state: StateType) => unknown>()
    protected state?: StateType

    /**
     * Get the current state or undefined if not set.
     */
    get(): StateType | undefined {
        return this.state
    }

    /**
     * Set the new state and notify observers.
     * @param newState The new state to set.
     */
    set(newState: StateType) {
        this.state = newState
        this.updateCalls.forEach((call) => call(newState))
        this.updateCalls.clear()
    }

    /**
     * Await a state change. If the state is already set, returns it immediately.
     * Otherwise, returns a Promise that resolves with the new state.
     */
    async await(): Promise<StateType> {
        if (this.state !== undefined) {
            return this.state
        }
        return new Promise<StateType>((resolve) => {
            this.updateCalls.add(resolve)
        })
    }
}
