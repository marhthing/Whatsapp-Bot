class States {
    constructor(botClient, eventBus) {
        this.botClient = botClient;
        this.eventBus = eventBus;
        this.chatStates = new Map(); // chatId -> state
    }

    setState(chatId, state, data = {}) {
        this.chatStates.set(chatId, {
            name: state,
            data,
            timestamp: new Date().toISOString()
        });
        
        this.eventBus.emit('chat_state_changed', {
            chatId,
            state,
            data
        });
    }

    getState(chatId) {
        return this.chatStates.get(chatId);
    }

    clearState(chatId) {
        const hadState = this.chatStates.has(chatId);
        this.chatStates.delete(chatId);
        
        if (hadState) {
            this.eventBus.emit('chat_state_cleared', { chatId });
        }
        
        return hadState;
    }

    hasState(chatId, stateName = null) {
        const state = this.chatStates.get(chatId);
        if (!state) return false;
        
        return stateName ? state.name === stateName : true;
    }

    updateStateData(chatId, updates) {
        const currentState = this.chatStates.get(chatId);
        if (!currentState) return false;
        
        currentState.data = { ...currentState.data, ...updates };
        currentState.timestamp = new Date().toISOString();
        
        this.eventBus.emit('chat_state_updated', {
            chatId,
            state: currentState.name,
            data: currentState.data,
            updates
        });
        
        return true;
    }

    getAllStates() {
        return Object.fromEntries(this.chatStates.entries());
    }

    getStatesByType(stateName) {
        const result = [];
        for (const [chatId, state] of this.chatStates.entries()) {
            if (state.name === stateName) {
                result.push({ chatId, ...state });
            }
        }
        return result;
    }

    clearAllStates() {
        const count = this.chatStates.size;
        this.chatStates.clear();
        
        this.eventBus.emit('all_states_cleared', { count });
        
        return count;
    }

    // Command flow states
    startCommandFlow(chatId, flowName, initialData = {}) {
        this.setState(chatId, `command_flow_${flowName}`, {
            flow: flowName,
            step: 0,
            ...initialData
        });
    }

    advanceCommandFlow(chatId, nextStep, data = {}) {
        const state = this.getState(chatId);
        if (state && state.name.startsWith('command_flow_')) {
            this.updateStateData(chatId, {
                step: nextStep,
                ...data
            });
            return true;
        }
        return false;
    }

    endCommandFlow(chatId) {
        const state = this.getState(chatId);
        if (state && state.name.startsWith('command_flow_')) {
            this.clearState(chatId);
            return true;
        }
        return false;
    }

    isInCommandFlow(chatId, flowName = null) {
        const state = this.getState(chatId);
        if (!state || !state.name.startsWith('command_flow_')) {
            return false;
        }
        
        if (flowName) {
            return state.data.flow === flowName;
        }
        
        return true;
    }
}

module.exports = States;
